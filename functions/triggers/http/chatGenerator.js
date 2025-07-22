// functions/triggers/http/chatGenerator.js

/* global process */

import { onCall } from "firebase-functions/v2/https";
import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { checkRateLimit } from "../../utils/rateLimits.js";
import dotenv from "dotenv";
import {
  prepareDocumentFunctionResponse,
  searchDocuments,
} from "../../utils/chat/documentSearch.js";
import {
  searchDocumentsFunctionDeclaration,
  routerFunctionDeclarations,
} from "../../utils/chat/functionDeclarations.js";
import {
  routerSystemInstruction,
  answeringAgentSystemInstruction,
  generalAgentSystemInstruction,
  explanationAgentSystemInstruction,
} from "../../utils/chat/agentSystemInstructions.js";

dotenv.config();

// Validate Gemini API key
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

// Validate ZeroEntropy API key
if (!process.env.ZEROENTROPY_API_KEY) {
  throw new Error("ZERO_ENTROPY_API_KEY environment variable is required");
}

// Initialize the Google GenAI client
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialization of ZeroEntropy client moved to documentSearch.js

// Custom error class for rate limiting
class RateLimitError extends Error {
  constructor(rateLimitInfo) {
    super(
      `Rate limit exceeded: ${rateLimitInfo.currentCount}/${rateLimitInfo.limitPerDay} requests per day`
    );
    this.name = "RateLimitError";
    this.rateLimitInfo = rateLimitInfo;
  }
}

// Helper function declarations moved to documentSearch.js

// Function to format history for multimodal content
function formatHistoryForMultimodal(history) {
  return history.map((msg) => {
    const formattedMessage = {
      role: msg.sender === "user" ? "user" : "model",
      parts: [],
    };

    // Handle text content
    if (msg.content) {
      formattedMessage.parts.push({ text: msg.content });
    }

    // Handle media content (images)
    if (msg.mediaContent && Array.isArray(msg.mediaContent)) {
      msg.mediaContent.forEach((media) => {
        if (media.type === "image" && media.data) {
          formattedMessage.parts.push({
            inlineData: {
              data: media.data,
              mimeType: media.mimeType || "image/jpeg",
            },
          });

          // Log info about the image being included in history
          logger.info(
            `Including ${media.mimeType || "image/jpeg"} in conversation history`
          );
        }
      });
    }

    // Ensure parts is not empty, as the Google GenAI API requires non-empty parts for any content.
    // This can happen if a history item from the client had no text and no (valid) media.
    if (formattedMessage.parts.length === 0) {
      const placeholderText =
        formattedMessage.role === "user"
          ? "[User's previous image content is unavailable in history]"
          : "[Previous model response content is unavailable or was empty]";
      logger.warn(
        `Formatted message (role: ${formattedMessage.role}, original content: "${msg.content || ""}", media items: ${msg.mediaContent?.length || 0}) resulted in empty parts. Adding placeholder: "${placeholderText}"`
      );
      formattedMessage.parts.push({ text: placeholderText });
    }

    return formattedMessage;
  });
}

// Handle document search for any agent
async function handleDocumentSearch(
  previousContents,
  searchQuery,
  userId,
  detailLevel = "moderate",
  streamResponse = null
) {
  // Send status update if streaming is enabled
  if (streamResponse) {
    streamResponse.sendChunk({
      type: "status_update",
      payload: {
        step: "searching_documents",
        message: `Searching for: "${searchQuery}"...`,
      },
    });
  }

  // Use the imported searchDocuments function directly
  const searchResults = await searchDocuments(searchQuery, userId, {
    detailLevel: detailLevel,
  });

  // Send status update after search completes
  if (streamResponse) {
    const searchOutcome = searchResults.usedDocuments
      ? "found relevant documents"
      : "no relevant documents found";

    streamResponse.sendChunk({
      type: "status_update",
      payload: {
        step: "search_complete",
        message: `Search finished: ${searchOutcome}. Generating response...`,
      },
    });
  }

  // Prepare the function response
  const functionResponse = prepareDocumentFunctionResponse(searchResults);

  // Find the last message in the conversation to get the function call
  let lastMessage = previousContents[previousContents.length - 1];

  // If the last message isn't a model message with function calls, use the second-to-last
  if (
    lastMessage.role !== "model" ||
    !lastMessage.parts.some((part) => part.functionCall)
  ) {
    lastMessage = previousContents[previousContents.length - 2];
  }

  // Find all function calls in the last model message
  const functionCalls = [];
  if (lastMessage && lastMessage.role === "model") {
    for (const part of lastMessage.parts) {
      if (part.functionCall) {
        functionCalls.push(part.functionCall);
      }
    }
  }

  // DEBUG: Log the function calls found
  logger.info(
    `Found ${functionCalls.length} function calls in last message: ${JSON.stringify(functionCalls)}`
  );

  // Create a response for each function call
  const responseParts = functionCalls.map((functionCall) => {
    // Only respond to search_documents function calls with our data
    if (functionCall.name === "search_documents") {
      return {
        functionResponse: {
          name: "search_documents",
          response: functionResponse,
        },
      };
    }

    // For other function calls, provide an empty response (should not happen)
    return {
      functionResponse: {
        name: functionCall.name,
        response: { error: "Function not implemented" },
      },
    };
  });

  // If no function calls were found, still provide the response for search_documents
  if (responseParts.length === 0) {
    responseParts.push({
      functionResponse: {
        name: "search_documents",
        response: functionResponse,
      },
    });
  }

  // DEBUG: Log the exact functionResponse object being sent back
  // logger.info(
  //   "Function response being sent back:",
  //   JSON.stringify(responseParts, null, 2)
  // );

  // Create the content that includes the function response
  const contentsWithFunctionResponse = [
    ...previousContents,
    {
      role: "model",
      parts: responseParts,
    },
  ];

  return {
    contentsWithFunctionResponse,
    searchResults,
  };
}

// Handle answering agent functionality (renamed from QA agent)
async function handleAnsweringAgent(
  formattedHistory,
  prompt,
  userId,
  detectedLanguage = null,
  mediaContent = null,
  streamResponse = null,
  likelyNeedsDocuments = false
) {
  // Customize system instruction based on detected language
  let customizedInstruction = answeringAgentSystemInstruction;

  // Add language-specific instruction if a language was detected
  if (detectedLanguage && detectedLanguage !== "english") {
    customizedInstruction = `${answeringAgentSystemInstruction}\n\nThe user's query is in ${detectedLanguage}. You MUST answer in ${detectedLanguage.toUpperCase()}.`;
    logger.info(
      `Instructing answering agent to respond in ${detectedLanguage}`
    );
  }

  // Log router guidance for debugging
  if (likelyNeedsDocuments) {
    logger.info(`Router indicated documents likely needed for answering agent`);
  }

  const answeringConfig = {
    tools: [
      {
        functionDeclarations: [searchDocumentsFunctionDeclaration],
      },
    ],
    systemInstruction: customizedInstruction,
    temperature: 0.3,
    maxOutputTokens: 2048,
  };

  // Prepare prompt with any media content
  const userParts = [];
  if (prompt) {
    userParts.push({ text: prompt });
  } else if (
    mediaContent &&
    Array.isArray(mediaContent) &&
    mediaContent.some((m) => m.type === "image" && m.data)
  ) {
    const defaultText =
      detectedLanguage === "italian"
        ? "Potresti analizzare questa immagine per favore?"
        : "Please analyze this image";
    userParts.push({ text: defaultText });
  }
  if (mediaContent && Array.isArray(mediaContent)) {
    mediaContent.forEach((media) => {
      if (media.type === "image" && media.data) {
        userParts.push({
          inlineData: {
            data: media.data,
            mimeType: media.mimeType || "image/jpeg",
          },
        });
      }
    });
  }

  // Conversation history array we mutate
  const conversation = [
    ...formattedHistory,
    {
      role: "user",
      parts: userParts,
    },
  ];

  let usedDocuments = false;
  let documentSources = [];
  const MAX_TURNS = 5;
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const modelResponse = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      config: answeringConfig,
      contents: conversation,
    });

    const functionCalls = modelResponse.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      logger.info(
        `Answering agent turn ${turn + 1}: model requested function ${call.name}`
      );

      // Append model functionCall turn
      conversation.push({
        role: "model",
        parts: [
          {
            functionCall: call,
          },
        ],
      });

      let functionResponsePayload;

      if (call.name === "search_documents") {
        const searchQuery = call.args.query;
        const detailLevel = call.args.detail_level || "moderate";
        logger.info(
          `Answering agent performing search_documents for query: ${searchQuery}`
        );

        if (streamResponse) {
          streamResponse.sendChunk({
            type: "status_update",
            payload: {
              step: "searching_documents",
              message: `Searching for: "${searchQuery}"...`,
            },
          });
        }

        const searchResults = await searchDocuments(searchQuery, userId, {
          detailLevel,
        });
        functionResponsePayload =
          prepareDocumentFunctionResponse(searchResults);
        // logger.info(
        //   "Answering agent functionResponse (search_documents):",
        //   JSON.stringify(functionResponsePayload, null, 2)
        // );

        usedDocuments = searchResults.usedDocuments || usedDocuments;
        documentSources = searchResults.documentSources || documentSources;

        if (streamResponse) {
          const outcome = searchResults.usedDocuments
            ? "found relevant documents"
            : "no relevant documents found";
          streamResponse.sendChunk({
            type: "status_update",
            payload: {
              step: "search_complete",
              message: `Search finished: ${outcome}.`,
            },
          });
        }
      } else {
        logger.warn(
          `Answering agent received unsupported function call: ${call.name}`
        );
        functionResponsePayload = {
          error: `Function ${call.name} not implemented.`,
        };
      }

      // Append tool response
      conversation.push({
        role: "tool",
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: functionResponsePayload,
            },
          },
        ],
      });

      // Continue loop
      continue;
    }

    // No function call, extract text
    try {
      finalText = modelResponse.text || "";
    } catch (err) {
      logger.error("Error extracting text from answering agent response:", err);
      finalText = "Sorry, there was an error processing the response.";
    }
    break; // exit
  }

  if (!finalText) {
    logger.warn(
      "Answering agent reached max turns without final text. Returning fallback error."
    );
    finalText = "Sorry, the request could not be completed in time.";
  }

  return {
    success: true,
    data: {
      response: finalText,
      usedDocuments,
      documentSources,
      agentType: "question_answering",
      detectedLanguage,
    },
  };
}

// Handle explanation agent functionality
async function handleExplanationAgent(
  formattedHistory,
  prompt,
  userId,
  detectedLanguage = null,
  mediaContent = null,
  streamResponse = null,
  likelyNeedsDocuments = false
) {
  // Customize system instruction based on detected language and router guidance
  let customizedInstruction = explanationAgentSystemInstruction;

  // Add language-specific instruction if a language was detected
  if (detectedLanguage && detectedLanguage !== "english") {
    customizedInstruction = `${explanationAgentSystemInstruction}\n\nThe user's query is in ${detectedLanguage}. You MUST answer in ${detectedLanguage.toUpperCase()}.`;
    logger.info(
      `Instructing explanation agent to respond in ${detectedLanguage}`
    );
  }

  // Add router guidance about document search
  if (likelyNeedsDocuments) {
    customizedInstruction = `${customizedInstruction}\n\nIMPORTANT: The router has determined this query likely needs course material information. You MUST search documents first before providing your explanation.`;
    logger.info(
      `Router indicated documents likely needed - enforcing search for explanation agent`
    );
  }

  // Configure the explanation agent model
  const explanationTools = [
    {
      functionDeclarations: [searchDocumentsFunctionDeclaration],
    },
  ];

  const explanationConfig = {
    tools: explanationTools,
    systemInstruction: customizedInstruction,
    temperature: 0.7,
    maxOutputTokens: 4096,
  };

  // If router indicated documents are likely needed, encourage function calling
  if (likelyNeedsDocuments) {
    explanationConfig.toolConfig = {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.AUTO,
      },
    };
    logger.info("Added function calling config to encourage document search");
  }

  // Prepare prompt with any media content
  const userParts = [];

  // Add text content or default image analysis text if not provided but we have images
  if (prompt) {
    userParts.push({ text: prompt });
  } else if (
    mediaContent &&
    Array.isArray(mediaContent) &&
    mediaContent.some((m) => m.type === "image" && m.data)
  ) {
    // Add a default prompt to let the model know we're asking about the attached image
    const defaultText =
      detectedLanguage === "italian"
        ? "Potresti analizzare questa immagine per favore?"
        : "Please analyze this image";
    userParts.push({ text: defaultText });
  }

  // Add media content if available
  if (mediaContent && Array.isArray(mediaContent)) {
    mediaContent.forEach((media) => {
      if (media.type === "image" && media.data) {
        userParts.push({
          inlineData: {
            data: media.data,
            mimeType: media.mimeType || "image/jpeg",
          },
        });
      }
    });
  }

  // Track whether we ended up using any course material and their provenance
  let usedDocuments = false;
  let documentSources = [];

  // Will hold the final plain-text answer returned by the model
  let finalText = "";

  // Create the content array with history and the current prompt
  let explanationContents = [
    ...formattedHistory,
    {
      role: "user",
      parts: userParts,
    },
  ];

  const MAX_TURNS = 3; // Reduced MAX_TURNS as we expect fewer back-and-forths
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const modelResp = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-05-20",
      config: explanationConfig,
      contents: explanationContents,
    });
    const calls = modelResp.functionCalls || [];

    logger.info(
      `Explanation agent turn ${turn + 1}: received ${calls.length} function call(s)`
    );
    if (calls.length) {
      logger.info(
        `Explanation agent function calls on turn ${turn + 1}: ${JSON.stringify(
          calls,
          null,
          2
        )}`
      );
    }

    if (calls.length) {
      const call = calls[0];
      explanationContents.push({
        role: "model",
        parts: [{ functionCall: call }],
      });

      if (call.name === "search_documents") {
        const { contentsWithFunctionResponse, searchResults } =
          await handleDocumentSearch(
            explanationContents,
            call.args.query,
            userId,
            call.args.detail_level || "moderate",
            streamResponse
          );
        logger.info(
          `Explanation agent completed search_documents. usedDocuments: ${searchResults.usedDocuments}. snippets returned: ${searchResults.documentContext?.snippets?.length || 0}`
        );
        explanationContents = contentsWithFunctionResponse;
        usedDocuments = usedDocuments || searchResults.usedDocuments;
        if (Array.isArray(searchResults.documentSources)) {
          documentSources = [
            ...documentSources,
            ...searchResults.documentSources,
          ];
        }
        continue; // Loop again to get the explanation after search results
      }

      // Handle unknown/unexpected function calls if any (should not happen with current declarations)
      logger.warn(
        `Explanation agent received unexpected function call: ${call.name}`
      );
      explanationContents.push({
        role: "tool",
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: { error: "Function not expected by explanation agent" },
            },
          },
        ],
      });
      continue; // Loop again
    }

    // If no function calls, this should be the final textual explanation
    finalText = modelResp.text || "";
    logger.info(
      `Explanation agent produced final text (length ${finalText.length}): ${finalText.slice(0, 200)}${finalText.length > 200 ? "…" : ""}`
    );
    break; // Exit loop, we have the explanation
  }

  if (!finalText) {
    logger.warn(
      "Explanation agent reached max turns without final text. Returning fallback error."
    );
    finalText = "Sorry, the request could not be completed in time.";
  }

  return {
    success: true,
    data: {
      response: finalText,
      usedDocuments,
      documentSources,
      agentType: "explanation",
      detectedLanguage,
    },
  };
}

// Handle general agent functionality (no document operations)
async function handleGeneralAgent(
  formattedHistory,
  prompt,
  detectedLanguage = null,
  mediaContent = null
) {
  // Customize system instruction based on detected language
  let customizedInstruction = generalAgentSystemInstruction;

  // Add language-specific instruction if a language was detected
  if (detectedLanguage && detectedLanguage !== "english") {
    customizedInstruction = `${generalAgentSystemInstruction}\n\nThe user's query is in ${detectedLanguage}. You MUST answer in ${detectedLanguage.toUpperCase()}.`;
    logger.info(`Instructing general agent to respond in ${detectedLanguage}`);
  }

  // Configure the general agent model
  const generalConfig = {
    systemInstruction: customizedInstruction,
    temperature: 0.5,
    maxOutputTokens: 2048,
  };

  // Prepare prompt with any media content
  const userParts = [];

  // Add text content if provided
  if (prompt) {
    userParts.push({ text: prompt });
  } else if (
    mediaContent &&
    Array.isArray(mediaContent) &&
    mediaContent.some((m) => m.type === "image" && m.data)
  ) {
    // Add a default prompt if only images were provided
    const defaultText =
      detectedLanguage === "italian"
        ? "Potresti analizzare questa immagine per favore?"
        : "Please analyze this image";
    userParts.push({ text: defaultText });
  }

  // Add media content if available
  if (mediaContent && Array.isArray(mediaContent)) {
    mediaContent.forEach((media) => {
      if (media.type === "image" && media.data) {
        userParts.push({
          inlineData: {
            data: media.data,
            mimeType: media.mimeType || "image/jpeg",
          },
        });
      }
    });
  }

  // Create the content array with history and the current prompt
  const generalContents = [
    ...formattedHistory,
    {
      role: "user",
      parts: userParts,
    },
  ];

  // Get response from the general agent model using the new SDK
  const result = await genAI.models.generateContent({
    model: "gemini-2.0-flash-lite",
    config: generalConfig,
    contents: generalContents,
  });

  // Get the final text response, ensuring we handle all potential response formats
  let responseText = "";
  try {
    // Extract text from the response, handling potential errors
    responseText = result.text || "";

    // Log any function calls for debugging
    if (result.functionCalls && result.functionCalls.length > 0) {
      logger.info(
        "General agent received function calls in response, but won't process them"
      );
    }
  } catch (error) {
    logger.error("Error extracting text from general agent response:", error);
    responseText = "Sorry, there was an error processing the response.";
  }

  return {
    success: true,
    data: {
      response: responseText,
      usedDocuments: false,
      documentSources: [],
      agentType: "general",
      detectedLanguage,
    },
  };
}

export const generateChatResponse = onCall(
  { enforceAppCheck: true, cors: true },
  async (request, response) => {
    try {
      const { prompt, history = [], mediaContent = null } = request.data;
      const userId = request.auth?.uid;

      // Validate inputs
      const isPromptEmpty = !prompt || prompt.trim() === "";
      const isMediaTrulyEmpty =
        !mediaContent ||
        !Array.isArray(mediaContent) ||
        mediaContent.length === 0 ||
        !mediaContent.some((item) => item.type === "image" && item.data);

      if (isPromptEmpty && isMediaTrulyEmpty) {
        logger.error(
          "Validation failed: Both prompt and mediaContent are effectively empty.",
          { prompt, mediaContent }
        );
        throw new Error(
          "Missing required field: A valid prompt or media content with image data is required."
        );
      }

      if (!userId) {
        throw new Error("Authentication required");
      }

      logger.info(`Processing chat request for user ${userId}`);
      if (mediaContent) {
        logger.info(
          `Request includes media content: ${mediaContent.length} items`
        );

        // Validate media content MIME types
        const supportedMimeTypes = [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/heic",
        ];
        if (Array.isArray(mediaContent)) {
          for (const media of mediaContent) {
            if (
              media.type === "image" &&
              media.mimeType &&
              !supportedMimeTypes.includes(media.mimeType.toLowerCase())
            ) {
              logger.error(
                `Unsupported image MIME type: ${media.mimeType} for user ${userId}. Prompt: "${prompt ? prompt.substring(0, 50) + "..." : "N/A"}"`
              );
              // Mimic structure of other errors for consistency client-side
              throw new Error(
                `Unsupported image type: ${media.mimeType}. Please use PNG, JPEG, WEBP, or HEIC.`
              );
            }
          }
        }
      }

      // Check rate limit using the centralized function
      try {
        const db = getFirestore();
        const rateLimitCheck = await checkRateLimit(
          userId,
          db,
          "chatGenerator"
        );

        if (!rateLimitCheck.allowed) {
          // Throw a specialized error with all rate limit information
          throw new RateLimitError(rateLimitCheck);
        }

        // Log successful rate limit check
        logger.info(
          `Rate limit check passed for user ${userId}. Usage: ${rateLimitCheck.currentCount}/${rateLimitCheck.limitPerDay}`
        );
      } catch (rateLimitError) {
        // Handle rate limit errors
        if (rateLimitError.name === "RateLimitError") {
          logger.warn(
            `Rate limit exceeded for user ${userId}: ${rateLimitError.message}`
          );

          // Format next available time for better user experience
          const nextAvailableTime = new Date(
            rateLimitError.rateLimitInfo.nextAvailableTimestamp
          );
          const formattedTime = nextAvailableTime.toLocaleTimeString();

          return {
            success: false,
            error: `Rate limit exceeded: ${rateLimitError.rateLimitInfo.currentCount}/${rateLimitError.rateLimitInfo.limitPerDay} requests per day`,
            isRateLimit: true,
            membershipTier: rateLimitError.rateLimitInfo.membershipTier,
            nextAvailableAt: nextAvailableTime,
            message: `You can try again after ${formattedTime}`,
          };
        } else {
          // Re-throw non-rate-limit errors from the rate limit check
          logger.error(
            `Error checking rate limit for user ${userId}:`,
            rateLimitError
          );
          throw rateLimitError;
        }
      }

      // Send initial status update if streaming is supported
      if (request.acceptsStreaming) {
        response.sendChunk({
          type: "status_update",
          payload: { step: "routing", message: "Routing request..." },
        });
      }

      // Format conversation history for Gemini, supporting multimodal content
      const formattedHistory = formatHistoryForMultimodal(history);

      // Log the formatted history before sending to router
      logger.info("Router history:", JSON.stringify(formattedHistory, null, 2));

      // First use the router to determine which agent should handle the request
      // Define router function declarations with Type for the new SDK
      const routerTools = [
        {
          functionDeclarations: routerFunctionDeclarations.map((decl) => {
            // Convert parameter types to use Type enum if needed
            return decl;
          }),
        },
      ];

      // Configuration for the router model
      const routerConfig = {
        tools: routerTools,
        systemInstruction: routerSystemInstruction,
        temperature: 0.1,
        maxOutputTokens: 1024,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY, // Force a function call
            allowedFunctionNames: ["select_agent"], // Only allow select_agent
          },
        },
      };

      // Prepare the user parts for the router with any media content
      const routerUserParts = [];

      // Add text content
      if (prompt) {
        routerUserParts.push({ text: prompt || "Analyze the attached image" });
      }

      // Add media content if available
      if (mediaContent && Array.isArray(mediaContent)) {
        mediaContent.forEach((media) => {
          if (media.type === "image" && media.data) {
            routerUserParts.push({
              inlineData: {
                data: media.data,
                mimeType: media.mimeType || "image/jpeg",
              },
            });
            logger.info(
              `Including ${media.mimeType || "image/jpeg"} in router request`
            );
          }
        });
      }

      // Create the content array with history and the current prompt including media
      const routerContents = [
        ...formattedHistory,
        {
          role: "user",
          parts: routerUserParts,
        },
      ];

      // Request the router response using the new SDK
      const routerResponse = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        config: routerConfig,
        contents: routerContents,
      });

      // Default to general agent if no agent selected
      let selectedAgent = "general";
      let agentReasoning = "Default agent selection";
      let detectedLanguage = null;
      let likelyNeedsDocuments = false;

      // Process function calls from the router response
      const functionCalls = routerResponse.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const functionCall = functionCalls[0];

        if (
          functionCall.name === "select_agent" &&
          functionCall.args.agent_type
        ) {
          selectedAgent = functionCall.args.agent_type;
          agentReasoning =
            functionCall.args.reasoning || "No reasoning provided";

          // Extract the detected language if available
          if (functionCall.args.detected_language) {
            detectedLanguage = functionCall.args.detected_language;
            logger.info(`Detected language: ${detectedLanguage}`);
          }

          // Extract whether documents are likely needed
          if (functionCall.args.likely_needs_documents !== undefined) {
            likelyNeedsDocuments = functionCall.args.likely_needs_documents;
            logger.info(`Likely needs documents: ${likelyNeedsDocuments}`);
          }

          logger.info(
            `Router selected agent: ${selectedAgent} - Reasoning: ${agentReasoning}`
          );
        } else {
          logger.warn(
            "Router did not select an agent, defaulting to general agent"
          );
        }
      } else {
        logger.warn(
          "Router did not make a function call, defaulting to general agent"
        );
      }

      // Send router result chunk
      if (request.acceptsStreaming) {
        response.sendChunk({
          type: "status_update",
          payload: {
            step: "router_selected",
            agentType: selectedAgent,
            reasoning: agentReasoning,
            detectedLanguage: detectedLanguage,
            likelyNeedsDocuments: likelyNeedsDocuments,
            message: `Selected ${selectedAgent} agent.`,
          },
        });
      }

      // Route to the appropriate agent based on the selection
      let agentResponse;
      switch (selectedAgent) {
        case "question_answering":
          if (request.acceptsStreaming) {
            response.sendChunk({
              type: "status_update",
              payload: {
                step: "agent_processing",
                message: "Processing your question...",
              },
            });
          }
          agentResponse = await handleAnsweringAgent(
            formattedHistory,
            prompt,
            userId,
            detectedLanguage,
            mediaContent,
            request.acceptsStreaming ? response : null,
            likelyNeedsDocuments
          );
          break;
        case "explanation":
          if (request.acceptsStreaming) {
            response.sendChunk({
              type: "status_update",
              payload: {
                step: "agent_processing",
                message: "Preparing explanation...",
              },
            });
          }
          agentResponse = await handleExplanationAgent(
            formattedHistory,
            prompt,
            userId,
            detectedLanguage,
            mediaContent,
            request.acceptsStreaming ? response : null,
            likelyNeedsDocuments
          );
          break;
        case "general":
        default: // Include fallback in default
          if (request.acceptsStreaming) {
            response.sendChunk({
              type: "status_update",
              payload: {
                step: "agent_processing",
                message: "Generating response...",
              },
            });
          }
          agentResponse = await handleGeneralAgent(
            formattedHistory,
            prompt,
            detectedLanguage,
            mediaContent
          );
          break;
      }

      // Add router's reasoning to the final response data
      if (agentResponse && agentResponse.data) {
        agentResponse.data.agentReasoning = agentReasoning;
        // Document sources are passed as separate metadata, no need to append to the response
      } else if (agentResponse) {
        agentResponse.agentReasoning = agentReasoning; // Handle potential direct return format if data structure changes
      }

      // Return the final result (for non-streaming clients or full data at end)
      return agentResponse;
    } catch (error) {
      logger.error("Error generating chat response:", error);

      // Return the error in the format that will work with onCall
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  }
);

/* global process */

import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { logger } from "firebase-functions";
import { checkRateLimit } from "../../utils/rateLimits.js";
import {
  tracedGenerativeAI,
  tracedGenerativeAIChunked,
} from "../../utils/observability.js";

// Initialize Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Retrieve document content from storage
const getDocumentContent = async (userId, docId) => {
  const db = getFirestore();
  const storage = getStorage().bucket();

  // Get the document metadata from Firestore
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);
  const docSnapshot = await docRef.get();

  if (!docSnapshot.exists) {
    throw new Error(`Document with ID ${docId} not found`);
  }

  const docData = docSnapshot.data();
  const cleanMarkdownPath = docData.smartStructure.cleanMarkdownPath;
  const language = docData.language;

  if (!cleanMarkdownPath) {
    throw new Error(`No markdown content found for document ${docId}`);
  }

  // Download the content from storage
  const [content] = await storage.file(cleanMarkdownPath).download();

  return {
    text: content.toString("utf-8"),
    language,
    docData,
  };
};

// Handle LaTeX in the markdown
const handleLatexInMarkdown = (text) => {
  let placeholderCounter = 0;
  const latexMap = new Map();

  const createPlaceholder = () => `__LATEX_${placeholderCounter++}__`;

  // Replace LaTeX with placeholders
  const replaceLatexWithPlaceholders = (text) => {
    // Inline LaTeX
    let processedText = text.replace(/\$\$(.*?)\$\$/g, (match) => {
      const placeholder = createPlaceholder();
      latexMap.set(placeholder, match);
      return placeholder;
    });

    // Block LaTeX
    processedText = processedText.replace(/\$(.*?)\$/g, (match) => {
      const placeholder = createPlaceholder();
      latexMap.set(placeholder, match);
      return placeholder;
    });

    return processedText;
  };

  // Restore LaTeX from placeholders
  const restoreLatexFromPlaceholders = (obj) => {
    if (typeof obj === "string") {
      let result = obj;
      for (const [placeholder, latex] of latexMap.entries()) {
        result = result.replace(new RegExp(placeholder, "g"), latex);
      }
      return result;
    } else if (Array.isArray(obj)) {
      return obj.map((item) => restoreLatexFromPlaceholders(item));
    } else if (obj !== null && typeof obj === "object") {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = restoreLatexFromPlaceholders(value);
      }
      return result;
    }
    return obj;
  };

  // Process the text
  const processedText = replaceLatexWithPlaceholders(text);

  return {
    processedText,
    restoreLatex: (obj) => restoreLatexFromPlaceholders(obj),
  };
};

// Function to chunk the content if it's too large
const chunkContent = (text, maxChunkSize = 12000) => {
  // If the text is small enough, return it as a single chunk
  if (text.length <= maxChunkSize) {
    return [text];
  }

  // Split the text by paragraphs or sections
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds the max size and we already have content,
    // push the current chunk and start a new one
    if (
      currentChunk.length + paragraph.length > maxChunkSize &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk);
      currentChunk = paragraph;
    } else {
      // Otherwise, add this paragraph to the current chunk
      if (currentChunk.length > 0) {
        currentChunk += "\n\n";
      }
      currentChunk += paragraph;
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  logger.info(`Split content into ${chunks.length} chunks`);
  return chunks;
};

// Process quiz using Gemini API
const processQuiz = async (text, language, userId, docId, membershipTier) => {
  // Define the max chunk size for processing
  const MAX_CHUNK_SIZE = 12000; // characters, adjust based on Gemini's context window

  // Handle LaTeX in the text
  const { processedText, restoreLatex } = handleLatexInMarkdown(text);

  // Split content into manageable chunks if it's too large
  const contentChunks = chunkContent(processedText, MAX_CHUNK_SIZE);

  // Format chunks with metadata for the chunked processing function
  const chunks = contentChunks.map((chunkText, index) => ({
    text: chunkText,
    metadata: {
      chunkIndex: index + 1,
      totalChunks: contentChunks.length,
      chunkLength: chunkText.length,
    },
  }));

  // If we have multiple chunks, use the hierarchical tracing approach
  if (chunks.length > 1) {
    logger.info(
      `Processing document in ${chunks.length} chunks with hierarchical tracing`
    );

    // Define the processing function for each chunk
    const processChunkWithTrace = async (chunk, index, parentTrace) => {
      const startId =
        index === 0
          ? 1
          : // Calculate starting ID based on previous chunks
            chunks.slice(0, index).reduce((count, prevChunk) => {
              // Estimate ~7 questions per chunk on average
              return count + Math.ceil(prevChunk.text.length / 1500);
            }, 1);

      // Process this chunk with the parent trace
      return await processChunkInternal(
        chunk.text,
        language,
        startId,
        userId,
        docId,
        membershipTier,
        chunk.metadata.chunkIndex,
        chunk.metadata.totalChunks,
        parentTrace
      );
    };

    // Process all chunks with a single parent trace
    const chunkedResult = await tracedGenerativeAIChunked({
      chunks,
      processingFunction: processChunkWithTrace,
      functionName: "generateQuiz",
      userId,
      documentId: docId,
      membershipTier,
      metadata: {
        documentLanguage: language,
        totalTextLength: text.length,
      },
    });

    // Combine all questions from all chunks
    const allQuestions = [];
    chunkedResult.results.forEach((result) => {
      allQuestions.push(...result.questions);
    });

    // Return combined results
    const combinedResult = { questions: allQuestions };
    return restoreLatex(combinedResult);
  } else {
    // For a single chunk, process normally
    logger.info("Processing document as a single chunk");
    const result = await processChunkInternal(
      processedText,
      language,
      1,
      userId,
      docId,
      membershipTier,
      1,
      1
    );
    return restoreLatex(result);
  }
};

// Process a single chunk of content
const processChunkInternal = async (
  chunkText,
  language,
  startId = 1,
  userId,
  docId,
  membershipTier,
  chunkIndex = 1,
  totalChunks = 1,
  parentTrace = null
) => {
  // Define schema for quiz questions - simplified structure
  const schema = {
    type: SchemaType.OBJECT,
    properties: {
      questions: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            id: {
              type: SchemaType.STRING,
              description: "A unique identifier for the question",
            },
            question: {
              type: SchemaType.STRING,
              description: "The question text",
            },
            type: {
              type: SchemaType.STRING,
              description:
                "The type of question (e.g., multiple-choice, fill-in-blank, matching, true-false)",
            },
            options: {
              type: SchemaType.ARRAY,
              description: "The possible answer options",
              items: {
                type: SchemaType.STRING,
              },
            },
            correctAnswer: {
              type: SchemaType.STRING,
              description: "The correct answer or index",
            },
            explanation: {
              type: SchemaType.STRING,
              description: "Explanation of why the answer is correct",
            },
          },
          required: [
            "id",
            "question",
            "type",
            "options",
            "correctAnswer",
            "explanation",
          ],
          propertyOrdering: [
            "id",
            "question",
            "type",
            "options",
            "correctAnswer",
            "explanation",
          ],
        },
      },
    },
    required: ["questions"],
    propertyOrdering: ["questions"],
  };

  // Configure the model with the schema
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  // Create language-specific instruction
  const languageInstruction = `The content is in ${language === "en" ? "English" : "Italian"} language. YOU MUST GENERATE THE QUIZ IN THE SAME LANGUAGE (${language === "en" ? "English" : "Italian"}). DO NOT TRANSLATE THE CONTENT.`;

  // Prepare the improved prompt for Gemini
  const prompt = `
You are an expert in creating educational quizzes.
${languageInstruction}

Based on the following content, create 5-10 quiz questions.

Content:
${chunkText}

Generate a variety of question types:
- 70% multiple-choice questions with 4 options each
- 20% true-false questions
- 10% fill-in-the-blank questions

For multiple-choice questions:
- Provide 4 options (A, B, C, D)
- Make sure exactly one option is correct
- Make incorrect options plausible

For true-false questions:
- Provide statements that are clearly true or false based on the content
- Use "True" and "False" as the only options

For fill-in-the-blank questions:
- Use underscores to indicate the blank
- The blank should be a single word or short phrase

For all questions:
- Each question must have a unique ID (start with "q${startId}" and increment for each question)
- Focus on the most important concepts
- Include a brief explanation for the correct answer
- Make questions challenging but fair
- Ensure all questions are answerable directly from the content
- Do not change or modify any LaTeX formulas in the content
- Every question must have options, even for true/false questions
- IMPORTANT: Keep all the content should be in ${language === "en" ? "English" : "Italian"} language
- Focus only on the text provided - do not reference images or information outside of this specific text chunk
`;

  try {
    // Use traced Gemini API call
    const result = await tracedGenerativeAI({
      model,
      prompt,
      functionName: "generateQuiz",
      userId,
      documentId: docId,
      membershipTier,
      metadata: {
        documentLanguage: language,
        textLength: chunkText.length,
        chunkIndex,
        totalChunks,
        startId,
      },
      parentTrace,
    });

    // With schema configuration, we can parse the response directly
    const quizData = JSON.parse(result.text);

    return quizData;
  } catch (error) {
    console.error("Error generating quiz with Gemini:", error);
    throw new Error(
      `Failed to generate quiz for a content chunk: ${error.message}`
    );
  }
};

// Initialize quiz status in the original document
const initializeProcessingStatus = async (userId, docId) => {
  const db = getFirestore();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.set(
    {
      quiz: {
        status: "processing",
        startedAt: new Date(),
      },
    },
    { merge: true }
  );

  return { id: docId };
};

// Update document status to error in the original document
const updateDocumentWithError = async (userId, docId, errorMessage) => {
  const db = getFirestore();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.set(
    {
      quiz: {
        status: "error",
        error: errorMessage,
        updatedAt: new Date(),
      },
    },
    { merge: true }
  );
};

// Special case for rate limit error
const updateDocumentWithRateLimitError = async (
  userId,
  docId,
  rateLimitInfo
) => {
  const db = getFirestore();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  const nextAvailableTime = new Date(rateLimitInfo.nextAvailableTimestamp);

  await docRef.set(
    {
      quiz: {
        status: "error",
        error: `Rate limit exceeded: ${rateLimitInfo.currentCount}/${rateLimitInfo.limitPerDay} requests per day. Please try again later.`,
        isRateLimit: true,
        membershipTier: rateLimitInfo.membershipTier,
        limitPerDay: rateLimitInfo.limitPerDay,
        nextAvailableAt: nextAvailableTime,
        updatedAt: new Date(),
      },
    },
    { merge: true }
  );
};

// Save quiz to Storage and update status in original document
const saveQuiz = async (userId, docId, quiz) => {
  const db = getFirestore();
  const storage = getStorage().bucket();

  // Calculate total number of questions
  const totalQuestions = quiz.questions.length;

  // Log the total number of questions generated
  logger.info(
    `Generated a total of ${totalQuestions} questions for document ${docId}`
  );

  // Generate a unique filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const quizPath = `users/${userId}/docs/${docId}/quiz/quiz-${timestamp}.json`;

  // 1. Save quiz to Storage as JSON file
  const quizFile = storage.file(quizPath);
  await quizFile.save(JSON.stringify(quiz, null, 2), {
    contentType: "application/json",
    metadata: {
      contentType: "application/json",
      metadata: {
        totalQuestions,
        createdAt: new Date().toISOString(),
      },
    },
  });

  // 2. Update status in the original document
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.set(
    {
      quiz: {
        status: "completed",
        updatedAt: new Date(),
        totalQuestions,
        storagePath: quizPath,
      },
    },
    { merge: true }
  );

  return { id: docId, storagePath: quizPath };
};

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

// Main function handler
export const generateQuiz = onCall(
  { enforceAppCheck: true, cors: true }, // Ensure authentication
  async (request) => {
    const { docId } = request.data;
    const userId = request.auth?.uid;

    // Validate inputs
    if (!docId) {
      throw new Error("Missing required parameter: docId");
    }

    if (!userId) {
      throw new Error("Authentication required");
    }

    let membershipTier;

    try {
      logger.info(`Generating quiz for document ${docId} for user ${userId}`);

      // Check rate limit using the improved centralized function
      try {
        const db = getFirestore();
        const rateLimitCheck = await checkRateLimit(
          userId,
          db,
          "quizGenerator"
        );

        if (!rateLimitCheck.allowed) {
          // Throw a specialized error with all rate limit information
          throw new RateLimitError(rateLimitCheck);
        }

        // Store membership tier for use in traced API calls
        membershipTier = rateLimitCheck.membershipTier;

        // Log successful rate limit check
        logger.info(
          `Rate limit check passed for user ${userId}. Usage: ${rateLimitCheck.currentCount}/${rateLimitCheck.limitPerDay}`
        );
      } catch (rateLimitError) {
        // Handle rate limit errors with better user feedback
        if (rateLimitError.name === "RateLimitError") {
          logger.warn(
            `Rate limit exceeded for user ${userId}: ${rateLimitError.message}`
          );

          // Update document with specialized rate limit error
          await updateDocumentWithRateLimitError(
            userId,
            docId,
            rateLimitError.rateLimitInfo
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

      // Initialize processing status in the original document
      await initializeProcessingStatus(userId, docId);

      // Get document content
      const { text, language } = await getDocumentContent(userId, docId);

      // Generate quiz with tracing
      const quiz = await processQuiz(
        text,
        language,
        userId,
        docId,
        membershipTier
      );

      // Save quiz to Storage
      const result = await saveQuiz(userId, docId, quiz);

      return {
        success: true,
        message: "Quiz generation completed",
        storagePath: result.storagePath,
      };
    } catch (error) {
      console.error("Error generating quiz:", error);

      // Update document with error status
      if (userId && docId) {
        await updateDocumentWithError(
          userId,
          docId,
          error.message || "Unknown error"
        );
      }

      return {
        success: false,
        error: error.message || "Failed to generate quiz",
      };
    }
  }
);

/* global process */

import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "firebase-functions";
import { checkRateLimit } from "../../utils/rateLimits.js";
import { tracedGenerativeAI } from "../../utils/observability.js";

// Initialize Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define the JSON schema for the mindmap structure
const mindmapSchema = {
  type: "OBJECT",
  properties: {
    title: {
      type: "STRING",
      description:
        "A concise and relevant title for the mindmap, derived from the central theme. Max 5-7 words.",
    },
    rootNode: {
      type: "OBJECT",
      properties: {
        label: {
          type: "STRING",
          description: "Central Theme text (2-4 words)",
        },
      },
      required: ["label"],
    },
    mainBranches: {
      type: "ARRAY",
      description: "Array of 4 to 6 main branch objects.",
      items: {
        type: "OBJECT",
        properties: {
          label: {
            type: "STRING",
            description: "Main Branch text (3-6 words)",
          },
          subBranches: {
            type: "ARRAY",
            description: "Optional array of 2 to 4 sub-branch objects.",
            items: {
              type: "OBJECT",
              properties: {
                label: {
                  type: "STRING",
                  description: "Sub-branch text (3-6 words)",
                },
                subBranches: {
                  // Level 3
                  type: "ARRAY",
                  description:
                    "Optional array of 1 to 2 sub-sub-branch objects (max depth).",
                  items: {
                    type: "OBJECT",
                    properties: {
                      label: {
                        type: "STRING",
                        description: "Sub-sub-branch text (3-6 words)",
                      },
                    },
                    required: ["label"],
                  },
                },
              },
              required: ["label"],
            },
          },
        },
        required: ["label"],
      },
    },
  },
  required: ["rootNode", "mainBranches"],
};

// Function to convert JSON mindmap data to Mermaid syntax
const convertJsonToMermaid = (jsonData) => {
  let mermaidString = "mindmap\n";
  const indent = (level) => "  ".repeat(level);

  if (jsonData.rootNode && jsonData.rootNode.label) {
    mermaidString += `${indent(1)}root((${jsonData.rootNode.label}))\n`;
  } else {
    // Fallback if rootNode or its label is missing, though schema should prevent this
    mermaidString += `${indent(1)}root((Untitled Mindmap))\n`;
    logger.warn("Root node label missing in JSON, using default.");
  }

  const processBranches = (branches, level) => {
    if (branches && Array.isArray(branches)) {
      branches.forEach((branch) => {
        if (branch.label) {
          mermaidString += `${indent(level)}${branch.label.replace(/\n/g, "<br/>")}\n`; // Allow <br/> for line breaks
          if (branch.subBranches) {
            processBranches(branch.subBranches, level + 1);
          }
        }
      });
    }
  };

  if (jsonData.mainBranches && Array.isArray(jsonData.mainBranches)) {
    processBranches(jsonData.mainBranches, 2); // Main branches start at level 2
  }

  return mermaidString.trim();
};

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

// Process mindmap using Gemini API with Langfuse tracing
const processMindmap = async (
  text,
  language,
  userId,
  membershipTier,
  docId
) => {
  // Create the model instance
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Prepare the prompt for Gemini - focus on content, structured as JSON
  const prompt = `
You are an educational assistant tasked with creating a clear, concise mindmap structure in JSON format to help students understand and remember the key ideas of a given document. The JSON will then be converted to a Mermaid mindmap.

## ANALYSIS INSTRUCTIONS:
1. Carefully analyze the document to identify the central theme.
2. Extract ONLY the most essential ideas (NOT every detail from the text).
3. Create a hierarchical structure with strict limits, reflected in the JSON:
   - ONE central theme/root node (derived from document headings or main subject).
   - 4-6 main branches (absolute maximum).
   - 2-4 sub-branches per main branch (when necessary).
   - Maximum depth: 3 levels total (root → main branches → sub-branches → sub-sub-branches).
4. Focus on understanding over completeness - a good mindmap highlights key concepts rather than exhaustive details.

## CONTENT PRIORITIZATION:
1. For longer texts (1000+ words): Stay high-level, focusing on major themes and concepts only.
2. For shorter texts: Still maintain brevity - never exceed the branch/depth limits.
3. When faced with dense content, prioritize:
   - Recurring themes
   - Foundational concepts necessary for understanding
   - Ideas explicitly emphasized in the original text
   - Cause-effect relationships when present
4. For chronological content (like history): Consider organizing branches in temporal sequence when appropriate.
5. Remember: The goal is a useful learning tool, not a complete text summary.

## DOMAIN-SPECIFIC ADAPTATION (for JSON label content):
1. **Scientific/Technical Content**:
   - Preserve essential technical terms in labels even if they slightly exceed word limits.
   - Identify key principles, methods, evidence, and conclusions for labels.
   - Represent mathematical relationships using simplified plain language in labels.

2. **Humanities/Social Sciences**:
   - Focus on key themes, arguments, evidence, and perspectives for labels.
   - Balance factual information with conceptual frameworks in labels.

3. **Procedural/Instructional Content**:
   - Emphasize sequence and dependencies between steps in labels.
   - Highlight critical decision points and alternatives in labels.

4. **Abstract Philosophical Concepts**:
   - Identify core ideas and their relationships for labels.
   - Represent opposing viewpoints when present in labels.

## JSON STRUCTURE REQUIREMENTS:
1. The entire output MUST be a single, valid JSON object, adhering strictly to the schema provided separately in the API call (responseSchema).
2. All text for "label" fields within the JSON (for rootNode, mainBranches, subBranches) must be EXTREMELY concise - maximum 3-6 words per node.
   - Exception: Technical terms or proper names that cannot be shortened.
   - NEVER use brackets or parentheses in these labels. If separators are needed, use hyphens or colons (e.g., "Dittatura - 1925" or "Dittatura: 1925").
   - You can use "\\n" within a label string if a line break is truly necessary for readability, which will be converted to <br/> in the final Mermaid.
3. Node labels should be in ${language === "en" ? "English" : "Italian"}.
4. The "mainBranches" array in the JSON must contain between 4 and 6 objects.
5. Each "subBranches" array (at any level) must contain between 2 and 4 objects.
6. The maximum depth of nesting for "subBranches" is 2 levels (rootNode -> mainBranches -> subBranches -> subBranches).

## SELF-VALIDATION (before producing JSON output):
Before finalizing, ask yourself:
1. Does my proposed JSON strictly adhere to the schema I was given (regarding structure, required fields, and array item limits for branches)?
2. Is the maximum depth constraint (root -> main -> sub -> sub-sub) respected?
3. Are all "label" strings concise and free of forbidden characters (parentheses, brackets)?
4. Does the JSON structure accurately represent the key concepts of the document without excessive detail?
5. Have I avoided adding interpretations not present in the original text?

Content to analyze and convert into the specified JSON structure:

<content>
${text}
</content>
`;

  try {
    // Use the traced wrapper for Gemini API call
    // IMPORTANT: Assumes tracedGenerativeAI can pass 'generationConfig' to the Gemini SDK.
    // If not, tracedGenerativeAI needs to be updated.
    const result = await tracedGenerativeAI({
      model,
      prompt,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: mindmapSchema,
      },
      functionName: "generateMindmap", // Updated function name for clarity
      userId,
      documentId: docId,
      membershipTier,
      metadata: {
        documentLanguage: language,
        textLength: text.length,
      },
    });

    let mindmapJsonString = result.text;
    let mindmapData;

    // Strip Markdown code block if present
    if (mindmapJsonString.startsWith("```json")) {
      mindmapJsonString = mindmapJsonString
        .substring(7, mindmapJsonString.length - 3)
        .trim();
    } else if (mindmapJsonString.startsWith("```")) {
      // Handle cases where just ``` is used without "json"
      mindmapJsonString = mindmapJsonString
        .substring(3, mindmapJsonString.length - 3)
        .trim();
    }

    try {
      mindmapData = JSON.parse(mindmapJsonString);
    } catch (parseError) {
      logger.error(
        "Error parsing JSON response from Gemini:",
        parseError,
        "Raw response:",
        mindmapJsonString
      );
      throw new Error(
        `Failed to parse mindmap JSON from AI: ${parseError.message}. Response was: ${mindmapJsonString.substring(0, 200)}...`
      );
    }

    // Convert the JSON data to Mermaid syntax
    const mermaidText = convertJsonToMermaid(mindmapData);

    // Extract title from the rootNode.label in the JSON data
    const title =
      mindmapData.rootNode && mindmapData.rootNode.label
        ? mindmapData.rootNode.label
        : "Untitled Mindmap";

    if (!mermaidText || !mermaidText.startsWith("mindmap")) {
      logger.error(
        "Generated Mermaid text is invalid or empty after JSON conversion.",
        { mermaidText }
      );
      throw new Error(
        "Generated content after JSON conversion does not produce a valid Mermaid mindmap."
      );
    }

    return {
      mermaid: mermaidText,
      title,
      traceId: result.traceId, // Pass along the trace ID
    };
  } catch (error) {
    logger.error("Error generating mindmap:", error);
    throw new Error(`Failed to generate mindmap: ${error.message}`);
  }
};

// Initialize mindmap status in the original document
const initializeProcessingStatus = async (userId, docId) => {
  const db = getFirestore();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.set(
    {
      mindmap: {
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
      mindmap: {
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
      mindmap: {
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

// Save mindmap to Firestore and update status in original document
const saveMindmap = async (userId, docId, mindmapData) => {
  const db = getFirestore();

  // Save mindmap to mindmaps collection
  const mindmapRef = db
    .collection("users")
    .doc(userId)
    .collection("mindmaps")
    .doc(docId);

  await mindmapRef.set({
    mermaid: mindmapData.mermaid,
    title: mindmapData.title,
    createdAt: new Date(),
    updatedAt: new Date(),
    traceId: mindmapData.traceId || null, // Store trace ID for potential feedback
  });

  // Update status in the original document
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.set(
    {
      mindmap: {
        status: "completed",
        updatedAt: new Date(),
        title: mindmapData.title,
        traceId: mindmapData.traceId || null, // Store trace ID for potential feedback
      },
    },
    { merge: true }
  );

  return { id: docId };
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
export const generateMindmap = onCall(
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

    let membershipTier; // Declare tier variable outside the try block

    try {
      logger.info(
        `Generating Mermaid mindmap for document ${docId} for user ${userId}`
      );

      // Check rate limit using the improved centralized function
      try {
        const db = getFirestore();
        const rateLimitCheck = await checkRateLimit(
          userId,
          db,
          "mindmapGenerator"
        );

        if (!rateLimitCheck.allowed) {
          // Throw a specialized error with all rate limit information
          throw new RateLimitError(rateLimitCheck);
        }

        // Assign the membership tier here
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

      // Generate mindmap with the traced version that includes Langfuse telemetry
      const mindmap = await processMindmap(
        text,
        language,
        userId,
        membershipTier,
        docId
      );

      // Save to Firestore with completed status
      await saveMindmap(userId, docId, mindmap);

      return {
        success: true,
        message: "Mindmap generation completed",
      };
    } catch (error) {
      logger.error("Error generating mindmap:", error);

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
        error: error.message || "Failed to generate mindmap",
      };
    }
  }
);

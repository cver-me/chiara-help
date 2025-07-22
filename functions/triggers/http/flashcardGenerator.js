/* global process */

import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { logger } from "firebase-functions";
import { checkRateLimit } from "../../utils/rateLimits.js";
import { tracedGenerativeAI } from "../../utils/observability.js";

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

// Process flashcards using Gemini API
const processFlashcards = async (
  text,
  language,
  userId,
  docId,
  membershipTier
) => {
  // Handle LaTeX in the text
  const { processedText, restoreLatex } = handleLatexInMarkdown(text);

  // Define proper schema for flashcards with categories at the top level
  const schema = {
    type: SchemaType.OBJECT,
    properties: {
      categories: {
        type: SchemaType.ARRAY,
        description:
          "Up to 5 main categories or topics covered in these flashcards",
        items: {
          type: SchemaType.STRING,
        },
        maxItems: 5,
      },
      flashcards: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            front: {
              type: SchemaType.STRING,
              description: "A clear, concise question or term",
              nullable: false,
            },
            back: {
              type: SchemaType.STRING,
              description: "A comprehensive explanation, definition, or answer",
              nullable: false,
            },
            difficulty: {
              type: SchemaType.STRING,
              description: "A difficulty level (easy, medium, or hard)",
              enum: ["easy", "medium", "hard"],
              nullable: false,
            },
          },
          required: ["front", "back", "difficulty"],
          propertyOrdering: ["front", "back", "difficulty"],
        },
      },
    },
    required: ["categories", "flashcards"],
    propertyOrdering: ["categories", "flashcards"],
  };

  // Configure the model with the schema
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  // Prepare the prompt for Gemini
  const prompt = `
Create a set of flashcards from the following content.
The content is in ${language === "en" ? "English" : "Italian"} language. YOU MUST GENERATE THE FLASHCARDS IN THE SAME LANGUAGE (${language === "en" ? "English" : "Italian"}). DO NOT TRANSLATE THE CONTENT.

Important guidelines:
1. First, identify up to 5 main categories or themes from the content.
2. Create 10-15 high-quality flashcards that cover the most important concepts.
3. Write clear, concise questions on the front.
4. Provide comprehensive but concise explanations on the back.
5. Assign an appropriate difficulty level (easy, medium, or hard).
6. Do not change or modify any LaTeX formulas in the content.
7. IMPORTANT: Keep all content in the original language (${language === "en" ? "English" : "Italian"}). DO NOT translate to another language.

The response should be in JSON format with:
1. A "categories" array with up to 5 main categories or topics (at the top level)
2. A "flashcards" array with each flashcard having "front", "back", and "difficulty" properties

Content:
${processedText}
`;

  try {
    // Use traced Gemini API call
    const result = await tracedGenerativeAI({
      model,
      prompt,
      functionName: "generateFlashcards",
      userId,
      documentId: docId,
      membershipTier,
      metadata: {
        documentLanguage: language,
        textLength: text.length,
      },
    });

    // Parse the response text
    const flashcardsData = JSON.parse(result.text);

    // Restore LaTeX in the flashcards
    const flashcardsWithLatex = restoreLatex(flashcardsData);

    return flashcardsWithLatex;
  } catch (error) {
    console.error("Error generating flashcards with Gemini:", error);
    throw new Error(`Failed to generate flashcards: ${error.message}`);
  }
};

// Initialize flashcard status in the original document
const initializeProcessingStatus = async (userId, docId) => {
  const db = getFirestore();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.set(
    {
      flashcards: {
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
      flashcards: {
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
      flashcards: {
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

// Save flashcards to Firestore and update status in original document
const saveFlashcards = async (userId, docId, flashcards) => {
  const db = getFirestore();

  // Calculate total number of cards
  const totalCards = flashcards.flashcards.length;

  // 1. Save flashcards to flashcards collection
  const flashcardsRef = db
    .collection("users")
    .doc(userId)
    .collection("flashcards")
    .doc(docId);

  await flashcardsRef.set({
    flashcards: flashcards.flashcards,
    totalCards: totalCards,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 2. Update status in the original document
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.set(
    {
      flashcards: {
        status: "completed",
        updatedAt: new Date(),
        totalCards: totalCards,
        categories: flashcards.categories,
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
export const generateFlashcards = onCall(
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
      logger.info(
        `Generating flashcards for document ${docId} for user ${userId}`
      );

      // Check rate limit using the improved centralized function
      try {
        const db = getFirestore();
        const rateLimitCheck = await checkRateLimit(
          userId,
          db,
          "flashcardGenerator"
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

      // Generate flashcards with tracing
      const flashcards = await processFlashcards(
        text,
        language,
        userId,
        docId,
        membershipTier
      );

      // Save flashcards to the document
      await saveFlashcards(userId, docId, flashcards);

      return {
        success: true,
        message: "Flashcard generation completed",
      };
    } catch (error) {
      console.error("Error generating flashcards:", error);

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
        error: error.message || "Failed to generate flashcards",
      };
    }
  }
);

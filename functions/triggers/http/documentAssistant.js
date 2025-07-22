/* global process */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore } from "firebase-admin/firestore";
import { checkRateLimit } from "../../utils/rateLimits.js";
import { tracedGenerativeAI } from "../../utils/observability.js";
import { buildPrompt } from "../../utils/promptBuilder.js";

// Validate Gemini API key
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

// Initialize Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

/**
 * Check rate limits with proper error handling
 * @param {string} userId - User ID
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @returns {Promise<Object>} Rate limit check result
 * @throws {HttpsError} if rate limit is exceeded or other errors occur
 */
const checkDocumentAssistantRateLimit = async (userId, db) => {
  try {
    const rateLimitCheck = await checkRateLimit(
      userId,
      db,
      "documentAssistant"
    );

    if (!rateLimitCheck.allowed) {
      throw new RateLimitError(rateLimitCheck);
    }

    return rateLimitCheck;
  } catch (error) {
    if (error.name === "RateLimitError") {
      const nextAvailableTime = new Date(
        error.rateLimitInfo.nextAvailableTimestamp
      );
      const formattedTime = nextAvailableTime.toLocaleTimeString();

      throw new HttpsError(
        "resource-exhausted",
        `Rate limit exceeded: ${error.rateLimitInfo.currentCount}/${error.rateLimitInfo.limitPerDay} requests per day. You can try again after ${formattedTime}.`,
        {
          isRateLimit: true,
          membershipTier: error.rateLimitInfo.membershipTier,
          limitPerDay: error.rateLimitInfo.limitPerDay,
          currentCount: error.rateLimitInfo.currentCount,
          nextAvailableAt: nextAvailableTime,
          message: `You can try again after ${formattedTime}`,
        }
      );
    } else {
      // Log internal errors before throwing
      console.error("Internal error during rate limit check:", error);
      throw new HttpsError("internal", "Error checking rate limit", error);
    }
  }
};

// Generate Summary Function
export const generateSummary = onCall(
  {
    cors: true,
    enforceAppCheck: true, // In production, set to true
    maxInstances: 10,
  },
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      textToSummarize,
      documentId,
      documentLanguage,
      documentContext = "",
      isEntireDocument = false,
    } = request.data;
    const userId = request.auth.uid;

    // Validate input
    if (!textToSummarize || !textToSummarize.trim()) {
      throw new HttpsError("invalid-argument", "Text to summarize is required");
    }
    if (!documentId) {
      throw new HttpsError("invalid-argument", "Document ID is required");
    }

    const db = getFirestore();

    try {
      const rateLimitCheck = await checkDocumentAssistantRateLimit(userId, db);
      const membershipTier = rateLimitCheck.membershipTier;

      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Updated context object structure for buildPrompt
      const promptContext = {
        text: textToSummarize,
        context: documentContext,
        documentLanguage: documentLanguage || "en",
        isEntireDocument: isEntireDocument,
      };

      // Call buildPrompt with userId and db, and await the result
      // Now returns both prompt and preferences
      const { prompt, preferences } = await buildPrompt(
        "summary",
        promptContext,
        userId,
        db
      );

      const result = await tracedGenerativeAI({
        model,
        prompt,
        functionName: "generateSummary",
        userId,
        documentId,
        membershipTier,
        metadata: {
          documentLanguage: promptContext.documentLanguage,
          textLength: textToSummarize.length,
          isEntireDocument,
          // Include user preferences in the trace
          userPreferences: preferences,
        },
      });

      return { content: result.text };
    } catch (error) {
      // Ensure HttpsError is thrown for client-side handling
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("Error generating summary:", error);
      throw new HttpsError("internal", "Failed to generate summary", {
        originalError: error.message,
      });
    }
  }
);

// Generate Explanation Function
export const generateExplanation = onCall(
  {
    cors: true,
    enforceAppCheck: true,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const {
      textToExplain,
      documentId,
      documentLanguage,
      documentContext = "",
    } = request.data;
    const userId = request.auth.uid;

    if (!textToExplain || !textToExplain.trim()) {
      throw new HttpsError("invalid-argument", "Text to explain is required");
    }
    if (!documentId) {
      throw new HttpsError("invalid-argument", "Document ID is required");
    }

    const db = getFirestore();

    try {
      const rateLimitCheck = await checkDocumentAssistantRateLimit(userId, db);
      const membershipTier = rateLimitCheck.membershipTier;

      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Updated context object structure for buildPrompt
      const promptContext = {
        text: textToExplain,
        context: documentContext,
        documentLanguage: documentLanguage || "en",
      };

      // Call buildPrompt with userId and db, and await the result
      // Now returns both prompt and preferences
      const { prompt, preferences } = await buildPrompt(
        "explanation",
        promptContext,
        userId,
        db
      );

      const result = await tracedGenerativeAI({
        model,
        prompt,
        functionName: "generateExplanation",
        userId,
        documentId,
        membershipTier,
        metadata: {
          documentLanguage: promptContext.documentLanguage,
          textLength: textToExplain.length,
          hasContext: documentContext && documentContext.trim().length > 0,
          // Include user preferences in the trace
          userPreferences: preferences,
        },
      });

      return { content: result.text };
    } catch (error) {
      // Ensure HttpsError is thrown for client-side handling
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error("Error generating explanation:", error);
      throw new HttpsError("internal", "Failed to generate explanation", {
        originalError: error.message,
      });
    }
  }
);

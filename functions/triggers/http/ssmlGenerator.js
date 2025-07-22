/**
 * SSML Generator Module
 * This module generates SSML (Speech Synthesis Markup Language) content from markdown.
 * It is designed to be imported and used by audioGenerator.js as part of the
 * integrated audio generation process.
 */

/* global process */
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { logger } from "firebase-functions";
import {
  tracedGenerativeAI,
  tracedGenerativeAIChunked,
} from "../../utils/observability.js"; // Import tracing functions
import { XMLValidator } from "fast-xml-parser";

// ===================================================
// CONFIGURATION & INITIALIZATION
// ===================================================

// Initialize environment variables
dotenv.config();

// Validate Gemini API key
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

// Initialize Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Constants
const MAX_CHUNK_SIZE_CHARS = 5000; // Maximum chunk size for SSML generation
// const API_DELAY_MS = 500; // Delay removed, chunked processing handles calls sequentially

// ===================================================
// MARKDOWN UTILS
// ===================================================

/**
 * Markdown utilities for chunking content
 */
const MarkdownUtils = {
  /**
   * Chunk markdown into smaller pieces for processing
   * @param {string} markdown - Markdown content to chunk
   * @returns {Array<string>} Array of markdown chunks
   */
  chunkMarkdown(markdown) {
    // If the markdown is small enough, return it as a single chunk
    if (markdown.length <= MAX_CHUNK_SIZE_CHARS) {
      return [markdown];
    }

    const chunks = [];
    const paragraphs = markdown.split(/\n\s*\n/); // Split by paragraph breaks
    let currentChunk = "";

    // Process each paragraph
    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed the chunk size, start a new chunk
      if (
        currentChunk.length + paragraph.length > MAX_CHUNK_SIZE_CHARS &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        // Otherwise, add this paragraph to the current chunk
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    }

    // Add the last chunk if there's anything left
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  },
};

// ===================================================
// SSML GENERATION UTILITIES
// ===================================================

/**
 * Utilities for SSML generation and processing
 */
const SSMLUtils = {
  /**
   * Convert markdown to SSML using Gemini with observability
   * @param {string} markdownText - Markdown text to convert
   * @param {string|null} language - Document language code (if known)
   * @param {string} userId - User ID for tracing
   * @param {string} docId - Document ID for tracing
   * @param {string} membershipTier - Membership tier for tracing
   * @returns {Promise<string>} Generated SSML
   */
  async generateSSML(
    markdownText,
    language = null,
    userId,
    docId,
    membershipTier
  ) {
    try {
      // Initialize the Gemini model
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Create chunks if the markdown is too large
      const contentChunks = MarkdownUtils.chunkMarkdown(markdownText);

      let combinedSSML = "";

      if (contentChunks.length > 1) {
        // Multi-chunk processing with hierarchical tracing
        logger.info(
          `Processing SSML in ${contentChunks.length} chunks with hierarchical tracing.`
        );

        // Format chunks for tracedGenerativeAIChunked
        const chunks = contentChunks.map((chunkText, index) => ({
          text: chunkText,
          metadata: {
            chunkIndex: index + 1,
            totalChunks: contentChunks.length,
            chunkLength: chunkText.length,
          },
        }));

        // Define the processing function for each chunk
        const processSSMLChunk = async (chunk, index, parentTrace) => {
          const prompt = this.buildSSMLPrompt(language);
          const result = await tracedGenerativeAI({
            model,
            prompt: [prompt, chunk.text], // Pass prompt and chunk text
            functionName: "generateSSML", // Base function name
            userId,
            documentId: docId,
            membershipTier,
            metadata: {
              documentLanguage: language,
              textLength: chunk.text.length,
              ...chunk.metadata,
            },
            parentTrace, // Link to the parent trace
          });
          return result.text; // Return only the SSML text for this chunk
        };

        // Process all chunks under a single parent trace
        const chunkedResult = await tracedGenerativeAIChunked({
          chunks,
          processingFunction: processSSMLChunk,
          functionName: "generateSSML",
          userId,
          documentId: docId,
          membershipTier,
          metadata: {
            documentLanguage: language,
            totalTextLength: markdownText.length,
          },
        });

        // Combine SSML chunks from results
        combinedSSML = this.combineSSMLChunks(chunkedResult.results);
      } else {
        // Single-chunk processing
        logger.info("Processing SSML as a single chunk.");
        const chunk = contentChunks[0];
        const prompt = this.buildSSMLPrompt(language);

        const result = await tracedGenerativeAI({
          model,
          prompt: [prompt, chunk], // Pass prompt and chunk text
          functionName: "generateSSML",
          userId,
          documentId: docId,
          membershipTier,
          metadata: {
            documentLanguage: language,
            textLength: chunk.length,
            chunkCount: 1,
          },
          parentTrace: null, // No parent trace for single chunk
        });

        combinedSSML = result.text;
      }

      // Clean the final SSML output
      return this.cleanSSMLOutput(combinedSSML);
    } catch (error) {
      console.error(`Error generating SSML:`, error);
      // Ensure the error message includes details from the Gemini API if possible
      const errorMessage = error.message.includes("Gemini API error")
        ? error.message
        : `Gemini API error during SSML generation: ${error.message}`;
      throw new Error(errorMessage);
    }
  },

  /**
   * Builds the prompt for SSML generation
   * @param {string|null} detectedLanguage - Document language if known
   * @returns {string} Prompt for Gemini model
   */
  buildSSMLPrompt(detectedLanguage) {
    return (
      "Convert this educational markdown text to simple, well-structured Speech Synthesis Markup Language (SSML) optimized for student learning. Follow these guidelines:\n\n" +
      "CRITICAL LANGUAGE REQUIREMENT:\n" +
      "1. ***IMPORTANT*** - FIRST DETECT THE LANGUAGE OF THE DOCUMENT (English, Italian, etc.)\n" +
      "2. GENERATE THE SSML ENTIRELY IN THE SAME LANGUAGE AS THE SOURCE DOCUMENT\n" +
      "3. DO NOT translate the content - preserve the original language\n" +
      "4. DO NOT add xml:lang attributes to any tags - we will handle language identification separately\n" +
      "5. DO NOT include xmlns attributes in your output\n" +
      "6. If the document is in a non-English language, use appropriate SSML tags for that language\n\n" +
      "CORE REQUIREMENTS:\n" +
      "1. First, completely remove ALL markdown formatting (*, #, -, >, backticks, etc.) from the input text\n" +
      "2. Wrap the entire content in <speak> tags\n" +
      "3. Use <p> tags for paragraphs and <s> tags for sentences to create natural speech patterns\n" +
      "4. Add simple <break> tags between sections (1s) and after important points (0.5s)\n" +
      "5. Use <emphasis> tags sparingly, only for the most important concepts\n" +
      "6. Use <say-as> tags only when necessary for numbers, dates, and abbreviations\n\n" +
      "CONTENT SIMPLIFICATION:\n" +
      "1. Convert all headings to simple sentences with appropriate <break> tags before them\n" +
      "2. For mathematical formulas and variables:\n" +
      '   a. Use <say-as interpret-as="spell-out">X</say-as> for single letter variables (like L, Q, r, etc.)\n' +
      '   b. For example, say "eight per eta per <say-as interpret-as="spell-out">L</say-as> per <say-as interpret-as="spell-out">Q</say-as>"\n' +
      "3. Convert list items to sentences with appropriate pauses\n" +
      "4. Convert image descriptions ([Media: ...]) to simple sentences\n" +
      "5. Use <prosody> only when absolutely necessary to slow down complex concepts\n\n" +
      "IMPORTANT GUIDELINES:\n" +
      "1. DO NOT overuse SSML tags - prioritize natural reading flow\n" +
      "2. COMPLETELY remove all markdown syntax from the input text\n" +
      "3. Focus on content readability rather than complex SSML structure\n" +
      "4. Use only the basic tags: speak, break, emphasis, say-as, p, s, and prosody\n" +
      "5. Avoid nested tags when possible to maintain simplicity\n\n" +
      (detectedLanguage
        ? `SPECIFIED DOCUMENT LANGUAGE: ${detectedLanguage}\n\n`
        : "") +
      "Here's the markdown text to convert:"
    );
  },

  /**
   * Clean SSML output from Gemini
   * @param {string} ssml - Raw SSML output from model
   * @returns {string} Cleaned SSML
   */
  cleanSSMLOutput(ssml) {
    let cleaned = ssml.trim();

    // 1. Remove outer code block wrappers if Gemini added them
    //    (e.g., ```xml ... ``` or ``` ... ```)
    cleaned = cleaned
      .replace(/^```(?:xml|ssml)?\s*/i, "")
      .replace(/\s*```$/, "");

    // 2. Ensure it starts with <speak> and ends with </speak>
    //    Handle potential attributes in the initial <speak> tag from Gemini
    if (!/^<speak\b[^>]*>/i.test(cleaned)) {
      cleaned = "<speak>" + cleaned;
    }
    if (!/<\/speak>$/i.test(cleaned)) {
      cleaned = cleaned + "</speak>";
    }

    // 3. Remove potential code fences *inside* the main <speak> tags
    //    (This is the fix for the observed error)
    //    Find the content between the first <speak...> and last </speak>
    const speakTagMatch = cleaned.match(/^<speak\b[^>]*>([\s\S]*)<\/speak>$/i);
    if (speakTagMatch && speakTagMatch[1]) {
      let innerContent = speakTagMatch[1];
      // Remove ```xml. , ``` , etc., especially if they appear at the start of the inner content
      innerContent = innerContent
        .replace(/^\s*```(?:xml|ssml)?\.?\s*/i, "")
        .trim();
      // Reconstruct the cleaned SSML
      cleaned = cleaned.replace(speakTagMatch[1], innerContent);
    }

    // 4. Basic XML/SSML validity checks (optional but helpful)
    //    - Remove extra spaces within tags
    cleaned = cleaned.replace(/<\s+/g, "<").replace(/\s+>/g, ">");
    //    - Remove self-closing syntax on tags that shouldn't have it (like <p/>)
    //      This is a simplification; a proper XML parser would be better.
    cleaned = cleaned.replace(/<p\s*\/>/gi, "<p></p>"); // Example for <p>
    cleaned = cleaned.replace(/<s\s*\/>/gi, "<s></s>"); // Example for <s>

    // 5. Fix common malformed say-as closing tags (e.g. </say-as.  or </say-as,)
    cleaned = cleaned.replace(/<\/say-as[^>]*>/gi, "</say-as>");

    // 6. Remove any remaining xmlns attributes (as requested in prompt)
    cleaned = cleaned.replace(/\s*xmlns=["'][^"']*["']/g, "");
    // Remove xml:lang attributes (as requested in prompt)
    cleaned = cleaned.replace(/\s*xml:lang=["'][^"']*["']/g, "");

    // =====================================================
    // 7. Validate XML structure and attempt auto-fixes for
    //    common unbalanced tags such as missing </p> etc.
    // =====================================================
    const performValidation = () =>
      XMLValidator.validate(cleaned, { allowBooleanAttributes: true });

    let validationResult = performValidation();

    if (validationResult !== true) {
      // Log validation error before attempting fix
      logger.warn(
        "SSML validation failed, attempting auto-fix",
        validationResult
      );
      cleaned = this.autoFixSSML(cleaned);
      validationResult = performValidation();

      if (validationResult !== true) {
        logger.warn(
          "SSML is still not well-formed after auto-fix. Proceeding anyway.",
          validationResult
        );
      }
    }

    // Log the final cleaned version for debugging (trimmed)
    // logger.info("Final cleaned SSML (first 300):", cleaned.substring(0, 300));

    return cleaned;
  },

  /**
   * Attempt to automatically balance common SSML tags (p, s, emphasis, say-as, prosody)
   * This is a best-effort fix and does not guarantee perfect XML, but addresses
   * the most common issues produced by LLMs (missing closing tags).
   *
   * @param {string} ssml - The SSML string to fix
   * @returns {string} - The potentially fixed SSML string
   */
  autoFixSSML(ssml) {
    let fixed = ssml;

    const tagsToBalance = ["p", "s", "emphasis", "say-as", "prosody"];

    for (const tag of tagsToBalance) {
      const openRegex = new RegExp(`<${tag}(\\s[^>]*)?>`, "gi");
      const closeRegex = new RegExp(`</${tag}>`, "gi");

      const openCount = (fixed.match(openRegex) || []).length;
      const closeCount = (fixed.match(closeRegex) || []).length;
      const diff = openCount - closeCount;

      if (diff > 0) {
        // Missing closing tags – add them just before </speak>
        const closingTags = Array(diff).fill(`</${tag}>`).join("");
        fixed = fixed.replace(/<\/speak>$/i, closingTags + "</speak>");
      } else if (diff < 0) {
        // Too many closing tags – remove the excess ones starting from the start
        let removeCount = -diff;
        fixed = fixed.replace(closeRegex, (match) => {
          if (removeCount > 0) {
            removeCount--;
            return ""; // strip this extra closing tag
          }
          return match; // keep remaining
        });
      }
    }

    return fixed;
  },

  /**
   * Combine SSML chunks into a single document
   * @param {Array<string>} ssmlChunks - Array of SSML chunks
   * @returns {string} Combined SSML document
   */
  combineSSMLChunks(ssmlChunks) {
    if (!ssmlChunks || ssmlChunks.length === 0) {
      return "<speak></speak>"; // Return empty valid SSML if no chunks
    }

    // First, clean each individual chunk to remove outer wrappers etc.
    const cleanedChunks = ssmlChunks.map((chunk) =>
      this.cleanSSMLOutput(chunk)
    );

    // Extract content from inside the <speak> tags of each cleaned chunk
    const combinedContent = cleanedChunks
      .map((cleanedChunk) => {
        const match = cleanedChunk.match(/<speak[^>]*>([\s\S]*)<\/speak>/i);
        return match ? match[1].trim() : ""; // Return inner content or empty string
      })
      .filter((content) => content) // Remove empty strings
      .join("\n"); // Join the inner content of all chunks

    // Wrap the final combined content in a single <speak> tag
    const finalSSML = `<speak>${combinedContent}</speak>`;

    // Run a final clean pass on the fully combined SSML
    return this.cleanSSMLOutput(finalSSML);
  },
};

// ===================================================
// DOCUMENT UTILITY FUNCTIONS
// ===================================================

/**
 * Document update utilities
 */
const DocumentUtils = {
  /**
   * Update document with TTS error status
   * @param {Object} docRef - Firestore document reference
   * @param {string} errorMessage - Error message
   * @returns {Promise<void>}
   */
  async updateWithTTSError(docRef, errorMessage) {
    try {
      await docRef.set(
        {
          tts: {
            status: "error",
            error: errorMessage,
            processedAt: new Date(),
          },
        },
        { merge: true }
      );
      logger.info(`Document updated with TTS error status: ${errorMessage}`);
    } catch (error) {
      logger.error(`Failed to update document with TTS error status: ${error}`);
    }
  },

  /**
   * Update document with TTS processing status
   * @param {Object} docRef - Firestore document reference
   * @returns {Promise<void>}
   */
  async updateWithTTSProcessing(docRef) {
    try {
      await docRef.set(
        {
          tts: {
            status: "processing",
            startedAt: new Date(),
          },
        },
        { merge: true }
      );
      logger.info("Document updated with TTS processing status");
    } catch (error) {
      logger.error(
        `Failed to update document with TTS processing status: ${error}`
      );
    }
  },

  /**
   * Update document with TTS completion status
   * @param {Object} docRef - Firestore document reference
   * @param {string} ssmlPath - Path to SSML file
   * @returns {Promise<void>}
   */
  async updateWithTTSCompletion(docRef, ssmlPath) {
    try {
      await docRef.set(
        {
          tts: {
            status: "completed",
            ssmlPath: ssmlPath,
            processedAt: new Date(),
          },
        },
        { merge: true }
      );
      logger.info("Document updated with TTS completion status");
    } catch (error) {
      logger.error(
        `Failed to update document with TTS completion status: ${error}`
      );
    }
  },
};

// Export utilities for use in audioGenerator.js
export { SSMLUtils, DocumentUtils };

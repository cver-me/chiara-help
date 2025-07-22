// functions/utils/documentSearch.js

/* global process */

import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { GoogleGenAI } from "@google/genai";
import { ZeroEntropy } from "zeroentropy";
import dotenv from "dotenv";

dotenv.config();

// Initialize Google Generative AI client
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize the ZeroEntropy client
const zeroEntropy = new ZeroEntropy(process.env.ZEROENTROPY_API_KEY);

/**
 * Unified document search function that implements progressive search strategy
 * @param {string} query - The search query
 * @param {string} userId - The user ID
 * @param {Object} options - Search options
 * @param {number} options.maxSearchAttempts - Maximum number of search attempts (default: 3)
 * @param {number} options.snippetsCount - Number of snippets to retrieve (default: 3)
 * @param {number} options.pagesCount - Number of pages to retrieve (default: 5)
 * @param {string} options.detailLevel - Detail level for page retrieval (default: "moderate")
 * @returns {Promise<Object>} - Search results with success status, snippets, and metadata
 */
export async function searchDocuments(query, userId, options = {}) {
  const {
    maxSearchAttempts = 3,
    snippetsCount = 3,
    pagesCount = 5,
    detailLevel = "moderate",
  } = options;

  logger.info(`Starting document search for query: "${query}"`);

  let searchAttempts = 0;
  let finalDocumentContext = null;
  let usedTopPages = false;
  let usedDocuments = false;
  let documentSources = [];

  try {
    // Get user's collection ID from Firestore
    const collectionName = await getUserCollectionName(userId);

    while (searchAttempts < maxSearchAttempts) {
      // First attempt: Use regular snippet search
      if (searchAttempts === 0) {
        logger.info(
          `Attempt ${searchAttempts + 1}: Searching for snippets matching query: "${query}"`
        );
        const snippetResults = await queryForSnippets(
          query,
          collectionName,
          snippetsCount
        );

        if (snippetResults.collectionNotFound) {
          logger.info(
            "User does not have a ZeroEntropy collection yet – skipping further search attempts."
          );
          finalDocumentContext = {
            success: false,
            snippets: [],
            message:
              "No document collection found – it seems you have not uploaded any study material yet.",
          };
          break;
        }

        if (snippetResults.success && snippetResults.snippets?.length > 0) {
          const evaluation = await evaluateSearchResults(
            query,
            snippetResults.snippets
          );

          if (
            evaluation.quality === "high" ||
            (evaluation.quality === "medium" && !evaluation.needsMoreContext)
          ) {
            finalDocumentContext = snippetResults;
            usedDocuments = true;
            documentSources = snippetResults.snippets.map((s) => ({
              title: s.document_title.title,
              docId: s.document_title.docId,
              page: s.page_number,
              usedTopPages: false,
            }));
            break;
          }

          logger.info(
            `Search quality evaluation: ${JSON.stringify(evaluation)}`
          );

          // Even for completely irrelevant results, we'll still try top pages
          if (evaluation.relevanceType === "completely_irrelevant") {
            logger.info(
              "Search results completely irrelevant, but still trying top pages search"
            );
            // Continue to next attempt (don't skip)
          }

          // Only proceed to top pages if content is partially relevant but needs more context
          if (
            evaluation.relevanceType === "partially_relevant" &&
            evaluation.needsMoreContext
          ) {
            logger.info(
              "Results partially relevant but need more context, trying top pages search"
            );
          }
        }
      }

      // Second attempt: Use top pages for more context
      if (searchAttempts === 1) {
        logger.info(
          `Attempt ${searchAttempts + 1}: Searching for full pages matching query: "${query}"`
        );
        const pageResults = await queryForPages(
          query,
          collectionName,
          pagesCount,
          detailLevel
        );

        if (pageResults.collectionNotFound) {
          logger.info(
            "User does not have a ZeroEntropy collection yet – skipping remaining search logic."
          );
          finalDocumentContext = {
            success: false,
            snippets: [],
            message:
              "No document collection found – it seems you have not uploaded any study material yet.",
          };
          break;
        }

        if (pageResults.success && pageResults.pages?.length > 0) {
          const evaluation = await evaluateSearchResults(
            query,
            pageResults.pages
          );

          logger.info(
            `Page evaluation result: quality=${evaluation.quality}, relevanceType=${evaluation.relevanceType}, needsMoreContext=${evaluation.needsMoreContext}`
          );
          logger.info(`Page evaluation reasoning: ${evaluation.reasoning}`);

          if (
            evaluation.quality === "high" ||
            evaluation.quality === "medium"
          ) {
            usedTopPages = true;
            usedDocuments = true;
            documentSources = pageResults.pages.map((p) => ({
              title: p.document_title.title,
              docId: p.document_title.docId,
              page: p.page_number,
              usedTopPages: true,
            }));

            finalDocumentContext = {
              success: true,
              snippets: pageResults.pages.map((page) => ({
                text: page.text,
                document_title: page.document_title,
                page_number: page.page_number,
                score: page.score,
              })),
            };
            break;
          }

          logger.info(
            `Top pages quality evaluation: ${JSON.stringify(evaluation)}`
          );
          logger.info("No relevant content found in top pages search");
        }
      }

      // Third attempt: Handle no relevant documents found
      if (searchAttempts === 2) {
        logger.info("No relevant documents found in search attempts");
        usedDocuments = false;
        documentSources = [];
        finalDocumentContext = {
          success: false,
          snippets: [],
          message: "No relevant information found in your course materials.",
        };
      }

      searchAttempts++;
    }

    return {
      success: true,
      documentContext: finalDocumentContext,
      usedDocuments,
      usedTopPages,
      documentSources,
      searchMethod: usedTopPages
        ? "top_pages"
        : usedDocuments
          ? "snippets"
          : "none",
    };
  } catch (error) {
    logger.error("Error searching documents:", error);
    return {
      success: false,
      error: error.message || "Failed to search documents",
      documentContext: {
        success: false,
        snippets: [],
        message: "Error searching your course materials.",
      },
      usedDocuments: false,
      documentSources: [],
    };
  }
}

/**
 * Get the user's ZeroEntropy collection name
 * @param {string} userId - The user ID
 * @returns {Promise<string>} - The collection name
 */
async function getUserCollectionName(userId) {
  try {
    const db = getFirestore();
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    // Use either the specific zeroEntropyCollectionId if it exists, or default to userId
    let collectionName;

    if (userData && userData.zeroEntropyCollectionId) {
      collectionName = userData.zeroEntropyCollectionId;
      logger.info(
        `Using custom ZeroEntropy collection: ${collectionName} for user ${userId}`
      );
    } else {
      // Use userId as the collection name
      collectionName = userId;
      logger.info(`Using userId as ZeroEntropy collection: ${collectionName}`);
    }

    return collectionName;
  } catch (error) {
    logger.error(`Error getting user collection name for ${userId}:`, error);
    // Default to userId in case of error
    return userId;
  }
}

/**
 * Query ZeroEntropy for relevant document snippets
 * @param {string} query - The search query
 * @param {string} collectionName - The ZeroEntropy collection name
 * @param {number} count - Number of snippets to retrieve
 * @returns {Promise<Object>} - Search results
 */
async function queryForSnippets(query, collectionName, count = 3) {
  try {
    // Verify the collection exists
    try {
      // Use the ZeroEntropy SDK to query top snippets
      const response = await zeroEntropy.queries.topSnippets({
        collection_name: collectionName,
        query: query,
        k: count, // Get top N snippets
        precise_responses: false,
      });

      // Process the response according to the SDK structure
      return {
        success: true,
        snippets: response.results.map((snippet) => ({
          text: snippet.content,
          document_title: extractDocumentTitle(snippet.path),
          page_number:
            snippet.page_span && snippet.page_span.length > 0
              ? snippet.page_span[0] + 1
              : null, // Convert to 1-indexed for display
          score: snippet.score,
        })),
      };
    } catch (error) {
      if (
        error.message &&
        error.message.toLowerCase().includes("collection not found")
      ) {
        logger.info(
          `ZeroEntropy collection ${collectionName} not found – the user has probably not uploaded any documents yet.`
        );
        return {
          success: false,
          error: "No document collection found",
          collectionNotFound: true,
        };
      }
      throw error; // Re-throw other errors
    }
  } catch (error) {
    logger.error("Error querying ZeroEntropy for snippets:", error);
    return {
      success: false,
      error: error.message || "Failed to retrieve document information",
    };
  }
}

/**
 * Query ZeroEntropy for full pages
 * @param {string} topic - The search topic
 * @param {string} collectionName - The ZeroEntropy collection name
 * @param {number} count - Number of pages to retrieve
 * @param {string} detailLevel - Detail level (basic, moderate, comprehensive)
 * @returns {Promise<Object>} - Search results
 */
async function queryForPages(
  topic,
  collectionName,
  count = 5,
  detailLevel = "moderate"
) {
  logger.info(
    `Starting queryForPages for topic: "${topic}" with detail level: ${detailLevel}`
  );

  try {
    try {
      // Log that we're about to call the ZeroEntropy API
      logger.info(`Calling ZeroEntropy API with collection: ${collectionName}`);

      const response = await zeroEntropy.queries.topPages({
        collection_name: collectionName,
        query: topic,
        k: count, // Fetch specified number of pages
        include_content: true, // Make sure content is included
      });

      // Log successful API response
      logger.info(
        `ZeroEntropy API responded with ${response.results?.length || 0} results`
      );

      // Process the response
      return {
        success: true,
        pages: response.results.map((page) => ({
          text: page.content,
          document_title: extractDocumentTitle(page.path),
          page_number:
            page.page_index !== undefined ? page.page_index + 1 : null, // Convert to 1-indexed
          score: page.score,
        })),
      };
    } catch (error) {
      if (
        error.message &&
        error.message.toLowerCase().includes("collection not found")
      ) {
        logger.info(
          `ZeroEntropy collection ${collectionName} not found – the user has probably not uploaded any documents yet.`
        );
        return {
          success: false,
          error: "No document collection found",
          collectionNotFound: true,
        };
      }

      // Log detailed error information for other errors
      logger.error(
        `ZeroEntropy API error in topPages: ${error.message}`,
        error
      );

      // Return a structured error response instead of rethrowing
      return {
        success: false,
        error: error.message || "Failed to retrieve document information",
      };
    }
  } catch (error) {
    logger.error("Error querying ZeroEntropy for pages:", error);
    return {
      success: false,
      error: error.message || "Failed to retrieve document pages",
    };
  }
}

/**
 * Helper function to extract a readable document title from the path
 * @param {string} path - The document path
 * @returns {Object} - The document title and ID
 */
function extractDocumentTitle(path) {
  if (!path) return { title: "Unknown Document", docId: null };

  // Based on the curl output, the path format is "docId/filename.ext"
  const parts = path.split("/");

  // Get the filename (should be the last part)
  if (parts.length > 1) {
    const filename = parts[parts.length - 1];
    const docId = parts[parts.length - 2]; // Extract the docId (the part before the filename)
    // Keep the file extension as requested
    return { title: filename, docId };
  } else if (parts.length === 1) {
    // If there's only one part, use that
    return { title: parts[0], docId: null };
  }

  return { title: "Unknown Document", docId: null };
}

/**
 * Function to evaluate search quality using LLM with structured output
 * @param {string} query - The search query
 * @param {Array} snippets - The search result snippets
 * @returns {Promise<Object>} - Evaluation results
 */
async function evaluateSearchResults(query, snippets) {
  // Enhanced schema to include relevance type
  const evaluationSchema = {
    type: "object",
    properties: {
      quality: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "The quality rating of the search results",
      },
      relevanceType: {
        type: "string",
        enum: ["relevant", "partially_relevant", "completely_irrelevant"],
        description: "The type of relevance of the results to the query",
      },
      needsMoreContext: {
        type: "boolean",
        description:
          "Whether more context is needed to provide a complete answer",
      },
      reasoning: {
        type: "string",
        description:
          "Explanation for the quality assessment and context decision",
      },
    },
    required: ["quality", "relevanceType", "needsMoreContext", "reasoning"],
    propertyOrdering: [
      "quality",
      "relevanceType",
      "needsMoreContext",
      "reasoning",
    ],
  };

  const evaluationPrompt = `You are a Search Quality Evaluator. Your goal is to assess if the given search snippets are sufficient to answer the user\\'s query, or if more context from full pages is needed.
Output a JSON object adhering to the schema with fields: \`quality\`, \`relevanceType\`, \`needsMoreContext\`, and \`reasoning\`.

User Query: "${query}"

Search Snippets:
${JSON.stringify(snippets, null, 2)}

Evaluation Guidelines:

1.  \`relevanceType\`:
    *   "relevant": Snippets directly address the query\\'s core subject.
    *   "partially_relevant": Some snippets are relevant, others tangential, or only a minor aspect of a multifaceted query is addressed.
    *   "completely_irrelevant": Snippets do not address the query\\'s main subject.

2.  \`quality\`:
    *   "high": Snippets are highly relevant, directly answer/provide substantial information, clear, minimal noise.
    *   "medium": Generally relevant but may be too brief, superficial, partially answer, or include some less relevant info.
    *   "low": Largely irrelevant, very superficial, unclear, or fail to address the query meaningfully.

3.  \`needsMoreContext\` (Boolean - CRITICAL):
    *   Set to \`true\` if snippets are too short/fragmented for full understanding, even if 'medium' quality. Also \`true\` if the query implies a need for depth/detail the snippets lack (e.g., "explain how X works", "compare A and B"). Essentially, if reading the full page would *significantly* improve the answer.
    *   Set to \`false\` if snippets, as-is, sufficiently answer the *specific* query.

4.  \`reasoning\` (String):
    *   Briefly justify your choices, especially for \`needsMoreContext\`. Explain *why* more context is (or isn\\'t) needed, referencing query and snippets.

Focus on whether the snippets *alone* are good enough, or if fetching the full page is essential for a good answer.`;

  try {
    // Use the new API structure with models.generateContent
    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash-lite",
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: evaluationSchema,
      },
      contents: evaluationPrompt,
    });

    const response = result.text;
    const parsedResponse = JSON.parse(response);

    return parsedResponse;
  } catch (error) {
    logger.error("Error in search quality evaluation:", error);
    // Return a default evaluation in case of error
    return {
      quality: "low",
      relevanceType: "completely_irrelevant",
      needsMoreContext: true,
      reasoning: "Error occurred during evaluation",
    };
  }
}

/**
 * Prepare document content for function response
 * @param {Object} searchResults - The search results
 * @returns {Object} - Formatted function response
 */
export function prepareDocumentFunctionResponse(searchResults) {
  if (!searchResults || !searchResults.success) {
    return {
      snippets: [],
      message: "No relevant information found in your course materials.",
      search_method: "none",
    };
  }

  if (
    searchResults.usedDocuments &&
    searchResults.documentContext?.snippets?.length > 0
  ) {
    const snippets = searchResults.documentContext.snippets;
    const snippetsFormatted = snippets.map((snippet, index) => ({
      snippet_id: index + 1,
      document_title: snippet.document_title.title,
      document_id: snippet.document_title.docId,
      page_number: snippet.page_number,
      text: snippet.text,
      relevance_score: snippet.score,
      search_method: searchResults.usedTopPages ? "top_pages" : "snippets",
    }));

    return {
      snippets: snippetsFormatted,
      message: `Found ${snippetsFormatted.length} relevant ${searchResults.usedTopPages ? "pages" : "passages"} in your course materials.`,
      search_method: searchResults.searchMethod,
    };
  }

  return {
    snippets: [],
    message: "No relevant information found in your course materials.",
    search_method: "none",
  };
}

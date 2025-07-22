import { httpsCallable } from "firebase/functions";
import { functions } from "../utils/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage } from "../utils/firebase";

/**
 * Fetch document content from Firestore or Storage
 * @param {string} documentId - The ID of the document
 * @param {string} uid - The user ID
 * @returns {Promise<string>} - The document content
 */
export const fetchDocumentContent = async (documentId, uid) => {
  if (!documentId || !uid) {
    throw new Error("Document ID and user ID are required");
  }

  try {
    // Check in possible collections
    const collections = ["docs", "lecture_transcripts"];
    let docData = null;

    // Try each collection until we find the document
    for (const collection of collections) {
      const docRef = doc(db, `users/${uid}/${collection}`, documentId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        docData = { id: docSnap.id, ...docSnap.data() };
        break;
      }
    }

    if (!docData) {
      throw new Error("Document not found");
    }

    // If this is a markdown document, we can use the content directly
    if (docData.content) {
      return docData.content;
    }

    // If it's a PDF or other file, try to get the markdown version if available
    if (
      docData.smartStructure?.cleanMarkdownPath &&
      docData.smartStructure?.status === "completed"
    ) {
      try {
        const markdownRef = ref(
          storage,
          docData.smartStructure.cleanMarkdownPath
        );
        const url = await getDownloadURL(markdownRef);
        const response = await fetch(url);
        return await response.text();
      } catch (e) {
        console.error("Error fetching markdown:", e);
      }
    }

    // Fallback message if content can't be retrieved
    return "Document content could not be retrieved. Please try selecting specific text instead.";
  } catch (error) {
    console.error("Error fetching document content:", error);
    throw error;
  }
};

/**
 * Generate a summary using Firebase Functions
 * @param {string} textToSummarize - The text to summarize (selection or entire document)
 * @param {string} documentId - The ID of the document
 * @param {string} documentLanguage - The language of the document
 * @param {string} uid - The user ID
 * @param {boolean} isEntireDocument - Whether the text is the entire document
 * @returns {Promise<Object>} - The generated summary
 */
export const generateSummary = async (
  textToSummarize,
  documentId,
  documentLanguage,
  uid,
  isEntireDocument = false
) => {
  try {
    // Only fetch document context if we're summarizing a selection
    let documentContext = "";
    if (!isEntireDocument) {
      try {
        documentContext = await fetchDocumentContent(documentId, uid);
      } catch (error) {
        console.warn("Could not fetch document context:", error);
        // Continue without context if there's an error
      }
    }

    const generateSummaryFunction = httpsCallable(functions, "generateSummary");
    const result = await generateSummaryFunction({
      textToSummarize,
      documentId,
      documentLanguage,
      documentContext,
      isEntireDocument,
    });
    return result.data;
  } catch (error) {
    console.error("Error generating summary:", error);
    throw error;
  }
};

/**
 * Generate an explanation of the selected text using Firebase Functions
 * @param {string} textToExplain - The text to explain
 * @param {string} documentId - The ID of the document
 * @param {string} documentLanguage - The language of the document
 * @param {string} uid - The user ID
 * @returns {Promise<Object>} - The generated explanation
 */
export const generateExplanation = async (
  textToExplain,
  documentId,
  documentLanguage,
  uid
) => {
  try {
    // Fetch document content to provide context
    let documentContext = "";
    try {
      documentContext = await fetchDocumentContent(documentId, uid);
    } catch (error) {
      console.warn("Could not fetch document context:", error);
      // Continue without context if there's an error
    }

    const generateExplanationFunction = httpsCallable(
      functions,
      "generateExplanation"
    );
    const result = await generateExplanationFunction({
      textToExplain,
      documentId,
      documentLanguage,
      documentContext,
    });
    return result.data;
  } catch (error) {
    console.error("Error generating explanation:", error);
    throw error;
  }
};

/**
 * Generate a Ws analysis of the document content using Firebase Functions
 * @param {string} documentContent - The document content to analyze
 * @param {string} documentId - The ID of the document
 * @param {string} documentLanguage - The language of the document
 * @returns {Promise<Object>} - The generated Ws analysis
 */
// export const generate7WAnalysis = async (
//   documentContent,
//   documentId,
//   documentLanguage
// ) => {
//   try {
//     const generate7WAnalysisFunction = httpsCallable(
//       functions,
//       "generate7WAnalysis"
//     );
//     const result = await generate7WAnalysisFunction({
//       documentContent,
//       documentId,
//       documentLanguage,
//     });
//     return result.data;
//   } catch (error) {
//     console.error("Error generating Ws analysis:", error);
//     throw error;
//   }
// };

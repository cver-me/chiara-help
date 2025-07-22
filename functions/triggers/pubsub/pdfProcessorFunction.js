import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { logger } from "firebase-functions";
import { processPdfFile as processWithGemini } from "./geminiProcessor.js";
import { processPdfFile as processWithMistral } from "./mistralProcessor.js";
import admin from "firebase-admin";
import { PDFDocument } from "pdf-lib";

/**
 * Analyzes a PDF document and determines which processor to use based on page orientation
 * @param {Object} fileData - The file data object containing filePath
 * @returns {Promise<Object>} - The result of processing
 */
async function processPdf(fileData) {
  logger.info(`Analyzing PDF document: ${fileData.filePath}`);

  try {
    // Get a reference to the PDF file in Firebase Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(fileData.filePath);

    // Download the file
    const [fileBuffer] = await file.download();

    // Load the PDF
    const pdfDoc = await PDFDocument.load(fileBuffer);

    // Get the first page
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new Error("PDF has no pages");
    }

    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    logger.info(`PDF first page dimensions: ${width}x${height}`);

    // Check if width > height (landscape orientation, likely slides)
    if (width > height) {
      logger.info(
        "Detected landscape orientation (likely slides). Using Gemini processor"
      );
      return processWithGemini(fileData);
    } else {
      logger.info(
        "Detected portrait orientation (likely document). Using Mistral OCR processor"
      );
      return processWithMistral(fileData);
    }
  } catch (error) {
    // If any error occurs during analysis, default to Gemini
    logger.warn(
      `Error analyzing PDF, defaulting to Gemini processor: ${error.message}`
    );
    return processWithGemini(fileData);
  }
}

/**
 * Cloud Function triggered by Pub/Sub message to process PDF documents
 * This function is optimized with higher memory and longer timeout
 */
export const processPdfDocumentTask = onMessagePublished(
  {
    topic: "pdf-processing",
    timeoutSeconds: 540, // Maximum allowed (9 minutes)
    memory: "1GiB", // More memory for faster processing
    maxInstances: 10, // Limit concurrent executions to control costs
  },
  async (event) => {
    logger.info("PDF processing task triggered by Pub/Sub");

    try {
      // Extract data from the Pub/Sub message
      const fileData = event.data.message.json;

      logger.info(`Processing PDF: ${fileData.filePath}`);

      // Call the PDF processing function with dynamic processor selection
      const result = await processPdf(fileData);

      logger.info(`PDF processing completed for: ${fileData.filePath}`, result);
      return result;
    } catch (error) {
      logger.error("Error processing PDF:", error);
      throw error; // Allows Pub/Sub to retry if needed
    }
  }
);

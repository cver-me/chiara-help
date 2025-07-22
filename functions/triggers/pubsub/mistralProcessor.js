/*
  Mistral PDF Processor Module
  This module processes PDF documents by transforming them into structured markdown using Mistral's OCR API.
  It's designed to be called from the onFileUpload trigger when a PDF is uploaded to the /docs/ path.
*/

/* global process, Buffer */
import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";
import { openAsBlob } from "node:fs";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { tracedPdfMistralEngine } from "../../utils/observability.js";

// ===================================================
// CONFIGURATION & INITIALIZATION
// ===================================================

// Initialize environment variables
dotenv.config();

// Validate Mistral API key
if (!process.env.MISTRAL_API_KEY) {
  throw new Error("MISTRAL_API_KEY environment variable is required");
}

// Initialize Mistral API client
const mistralClient = new Mistral(process.env.MISTRAL_API_KEY);

// Constants
const MAX_PDF_SIZE_MB = 200; // Maximum PDF size in MB
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024; // Convert to bytes
const OCR_MODEL = "mistral-ocr-latest"; // Mistral OCR model to use

// Regex patterns
const REGEX = {
  HEADING: /#{1,6} .+?$/gm,
  DISPLAY_FORMULA: /\$\$([^$]+)\$\$/g,
  INLINE_FORMULA: /(?<!\$)\$([^$]+)\$(?!\$)/g,
  IMAGE_TAG: /!\[(.*?)\]\((.*?)\)/g,
  HTML_COMMENT: /<!--[\s\S]*?-->/g,
  CODE_BLOCK_START: /^```(?:markdown|xml)?\n/,
  CODE_BLOCK_END: /\n```$/,
};

// ===================================================
// MARKDOWN PROCESSING UTILITIES
// ===================================================

/**
 * Utility functions for markdown processing
 */
const MarkdownUtils = {
  /**
   * Clean markdown by removing code block wrappers
   * @param {string} markdown - Markdown text to clean
   * @returns {string} Cleaned markdown
   */
  cleanMarkdown(markdown) {
    // Remove ```markdown at the start and ``` at the end if present
    if (markdown.startsWith("```markdown") || markdown.startsWith("```")) {
      return markdown
        .replace(REGEX.CODE_BLOCK_START, "")
        .replace(REGEX.CODE_BLOCK_END, "");
    }
    return markdown;
  },

  /**
   * Creates a clean version of markdown for reading in the smart view
   * @param {string} markdown - Original markdown content
   * @returns {string} Clean markdown for smart view
   */
  createCleanMarkdownForSmartView(markdown) {
    // Make a copy of the markdown
    let cleanMarkdown = markdown;

    // Replace HTML comments with minimal spacing
    cleanMarkdown = cleanMarkdown.replace(REGEX.HTML_COMMENT, " ");

    // BULLET POINTS HANDLING SECTION
    // Fix bullet points without spaces after dash (add space when there are multiple occurrences)
    // First, check if there are at least two instances of improperly formatted bullet points
    if ((cleanMarkdown.match(/-[a-zA-Z0-9]/g) || []).length >= 2) {
      // Add space after dash at beginning of lines
      cleanMarkdown = cleanMarkdown.replace(/\n-([a-zA-Z0-9])/g, "\n- $1");
      // Fix bullet point at start of text if needed
      cleanMarkdown = cleanMarkdown.replace(/^-([a-zA-Z0-9])/, "- $1");
      // Handle bullet points in the middle of a line (after a space only, not colon or comma)
      cleanMarkdown = cleanMarkdown.replace(/(\s)-([a-zA-Z0-9])/g, "$1- $2");

      // Convert sequential inline bullet points to proper list format
      // NEW REGEX EXCLUDES HEADINGS (LINES STARTING WITH #)
      cleanMarkdown = cleanMarkdown.replace(
        /^(?!\s*#).*([:;])\s+-\s*([^-]+)(\s+-\s*[^-]+)+/gm,
        function (match) {
          // Split by dash but keep the dash
          const parts = match.split(/(?=\s+-)/);

          // Handle the first part differently to extract the intro text
          const firstPart = parts.shift().trim();
          const colonMatch = firstPart.match(/^([^:]*[:;])\s*-(.*)$/);

          let result = "";
          if (colonMatch) {
            // We have text with a colon/semicolon, preserve it
            result = colonMatch[1] + "\n";
            // Add the first bullet point
            result += "- " + colonMatch[2].trim() + "\n";
          }

          // Add each remaining bullet point on its own line
          for (let i = 0; i < parts.length; i++) {
            const bulletText = parts[i].trim().replace(/^-\s*/, "");
            if (bulletText) {
              result += "- " + bulletText + "\n";
            }
          }

          return result;
        }
      );
    }

    // ORDERED LIST HANDLING SECTION
    // Handle cases where ordered list items don't have proper formatting (no period or space after number)
    // Example: "1Item" -> "1. Item"
    const orderedListLines = cleanMarkdown.match(/^[0-9]+[a-zA-Z][^\n]*/gm);
    if (orderedListLines && orderedListLines.length >= 2) {
      // Fix ordered list items at the beginning of lines
      cleanMarkdown = cleanMarkdown.replace(/^([0-9]+)([a-zA-Z])/gm, "$1. $2");
    }

    // BLOCKQUOTE HANDLING SECTION

    // 1. Handle case where a paragraph ends with punctuation and is followed by a blockquote
    // Example: "This is a sentence. \n\n> This is a blockquote."
    // We want to keep them as separate paragraphs but remove the blockquote marker
    cleanMarkdown = cleanMarkdown.replace(/([.!?:;])\n\n> /g, "$1\n\n");

    // 2. Handle case where a paragraph doesn't end with punctuation and is followed by a blockquote
    // that starts with lowercase letter (likely continuation of the same sentence)
    // Example: "This is a sentence\n\n> that continues here."
    cleanMarkdown = cleanMarkdown.replace(
      /([^.!?:;\n])\n\n> ([a-z])/g,
      "$1 $2"
    );

    // 3. Handle any remaining blockquotes by just removing the blockquote marker
    cleanMarkdown = cleanMarkdown.replace(/\n\n> /g, "\n\n");
    cleanMarkdown = cleanMarkdown.replace(/^> /gm, "");

    // Remove excessive whitespace and newlines
    cleanMarkdown = cleanMarkdown.replace(/\n{3,}/g, "\n\n"); // Replace 3+ newlines with 2
    cleanMarkdown = cleanMarkdown.replace(/[ \t]+/g, " "); // Replace multiple spaces/tabs with a single space

    // Fix cases where sentence parts got split with newlines
    // If a line ends without punctuation and the next line doesn't start with a capital letter,
    // join them without a paragraph break, UNLESS the first line is a heading or a display formula
    cleanMarkdown = cleanMarkdown.replace(
      /([^\n]*[^.!?:;\n])\n\n([a-z])/g,
      function (match, p1, p2) {
        const trimmedP1 = p1.trim();
        // Check if the first line is a heading (contains #) or ends with $$
        if (/#/.test(trimmedP1) || trimmedP1.endsWith("$$")) {
          // It's a heading or display formula, don't join
          return p1 + "\n\n" + p2;
        } else {
          // Not a heading or formula, join the lines
          return p1 + " " + p2;
        }
      }
    );

    // Fix cases where a period was added at the end of a chunk but next chunk starts with lowercase
    cleanMarkdown = cleanMarkdown.replace(/\.\n\n([a-z])/g, "\n\n$1");

    // Add this new line to fix periods followed by space and lowercase (from HTML comments)
    cleanMarkdown = cleanMarkdown.replace(/\. ([a-z])/g, " $1");

    // ACADEMIC PAPER NOTES HANDLING SECTION

    // 1. Handle the specific pattern where a standalone reference is followed by a footnote, breaking sentence flow
    // Example: "text without punctuation\n\n[^1]\n[^0]: footnote content\n\ndwellers who found"
    cleanMarkdown = cleanMarkdown.replace(
      /([^.!?:;\n])\n\n\[\^[^\]]*\]\n\[\^[^\]]*\]:[\s\S]*?\n\n([a-z])/g,
      "$1 $2"
    );

    // 2. Handle simple footnotes that interrupt text flow
    // Example: "text without punctuation\n\n[^0]: footnote content\n\ndwellers who found"
    cleanMarkdown = cleanMarkdown.replace(
      /([^.!?:;\n])\n\n\[\^[^\]]*\]:[\s\S]*?\n\n([a-z])/g,
      "$1 $2"
    );

    // 3. Handle inline reference markers at beginning of lines
    // Example: "text without punctuation\n\n[^0]text continuing"
    cleanMarkdown = cleanMarkdown.replace(
      /([^.!?:;\n])\n\n\[\^([^\]]*)\]([a-z])/g,
      "$1 [^$2]$3"
    );

    return cleanMarkdown;
  },
};

/**
 * Utilities for formula extraction and content tagging
 */
const FormulaUtils = {
  /**
   * Check if LaTeX string represents a valid mathematical expression
   * @param {string} latex - LaTeX formula to check
   * @returns {boolean} True if it's a valid mathematical expression
   */
  isProperFormula(latex) {
    const trimmedLatex = latex.trim();

    // 1. Skip single variables like x, y, z, \alpha, \beta etc.
    if (/^[a-zA-Z]$/.test(trimmedLatex) || /^\\[a-zA-Z]+$/.test(trimmedLatex)) {
      return false;
    }

    // 2. Minimum length check
    if (trimmedLatex.length < 4) {
      return false;
    }

    // 3. Check for common LaTeX math commands that indicate complex expressions
    const mathCommands =
      /\\(int|sum|prod|lim|frac|sqrt|partial|nabla|infty|begin\{|vec|hat|dot|bar)/;
    if (mathCommands.test(trimmedLatex)) {
      return true;
    }

    // 4. Check for relation operators (equals, inequalities)
    const hasRelationOperator =
      /[=<>≤≥]/.test(trimmedLatex) ||
      /\\(eq|ne|lt|gt|le|ge|neq|geq|leq)/.test(trimmedLatex);

    if (hasRelationOperator) {
      // Process equals sign case (existing logic)
      const equalsIndex = Math.max(
        trimmedLatex.indexOf("="),
        trimmedLatex.indexOf("\\eq"),
        trimmedLatex.indexOf("\\neq"),
        trimmedLatex.indexOf("\\ne")
      );

      // Process inequality signs
      const ltIndex = Math.max(
        trimmedLatex.indexOf("<"),
        trimmedLatex.indexOf("\\lt"),
        trimmedLatex.indexOf("\\leq"),
        trimmedLatex.indexOf("≤")
      );

      const gtIndex = Math.max(
        trimmedLatex.indexOf(">"),
        trimmedLatex.indexOf("\\gt"),
        trimmedLatex.indexOf("\\geq"),
        trimmedLatex.indexOf("≥")
      );

      // Find the first relation operator
      const relationIndex = [equalsIndex, ltIndex, gtIndex]
        .filter((idx) => idx !== -1)
        .sort((a, b) => a - b)[0];

      if (relationIndex !== undefined) {
        const leftSide = trimmedLatex.substring(0, relationIndex).trim();
        const rightSide = trimmedLatex.substring(relationIndex + 1).trim();

        // Ensure sides are not empty and not just the '$' symbol
        if (
          leftSide.length === 0 ||
          rightSide.length === 0 ||
          leftSide === "$" ||
          rightSide === "$"
        ) {
          return false;
        }

        return true;
      }
    }

    // 5. Check for complex expressions (superscripts, subscripts, etc.)
    if (/[\^_{}]/.test(trimmedLatex)) {
      // Must have balanced braces
      const openBraces = (trimmedLatex.match(/\{/g) || []).length;
      const closeBraces = (trimmedLatex.match(/\}/g) || []).length;

      // Ensure there's complexity beyond just braces
      if (
        openBraces === closeBraces &&
        (trimmedLatex.includes("^") || trimmedLatex.includes("_"))
      ) {
        return true;
      }
    }

    // 6. Check for arithmetic expressions with multiple terms
    const hasMultipleTerms =
      /[-+].*[-+]/.test(trimmedLatex) || /[*/÷×]/.test(trimmedLatex);
    if (hasMultipleTerms && /[a-zA-Z0-9]/.test(trimmedLatex)) {
      return true;
    }

    // 7. Ensure there's at least one alphanumeric character
    if (!/[a-zA-Z0-9]/.test(trimmedLatex)) {
      return false;
    }

    // 8. Explicitly block patterns like "$=" or "=$"
    if (trimmedLatex === "$=" || trimmedLatex === "=$") {
      return false;
    }

    // If nothing else matched but there's an equals sign, check both sides again
    if (trimmedLatex.includes("=")) {
      const equalsIndex = trimmedLatex.indexOf("=");
      const leftSide = trimmedLatex.substring(0, equalsIndex).trim();
      const rightSide = trimmedLatex.substring(equalsIndex + 1).trim();

      if (
        leftSide.length === 0 ||
        rightSide.length === 0 ||
        leftSide === "$" ||
        rightSide === "$"
      ) {
        return false;
      }

      return true;
    }

    // Default to false if no mathematical patterns were detected
    return false;
  },

  /**
   * Extract tagged elements from the markdown
   * @param {string} markdown - Markdown content to extract elements from
   * @returns {Promise<Object>} Object with extracted formulas and count
   */
  async extractElements(markdown) {
    // Initialize empty array for formulas
    const formulas = [];
    let processedText = markdown;

    try {
      // Extract display formulas first ($$...$$)
      let displayMatch;

      while ((displayMatch = REGEX.DISPLAY_FORMULA.exec(markdown)) !== null) {
        const formula = displayMatch[1].trim();
        if (formula.length > 0 && this.isProperFormula(formula)) {
          formulas.push({
            formula,
            type: "display",
          });

          // Replace the matched formula with a placeholder to prevent inline matching
          processedText = processedText.replace(
            displayMatch[0],
            " FORMULA_PLACEHOLDER "
          );
        }
      }

      // Now extract inline formulas from the modified text ($...$)
      let inlineMatch;

      while (
        (inlineMatch = REGEX.INLINE_FORMULA.exec(processedText)) !== null
      ) {
        const formula = inlineMatch[1].trim();
        if (formula.length > 0 && this.isProperFormula(formula)) {
          formulas.push({
            formula,
            type: "inline",
          });
        }
      }

      // Extract images
      const images = [];
      let imageMatch;
      while ((imageMatch = REGEX.IMAGE_TAG.exec(markdown)) !== null) {
        const alt = imageMatch[1].trim();
        const src = imageMatch[2].trim();

        images.push({
          alt,
          src,
        });
      }

      // Flattened structure with formulas and count
      return {
        formulas,
        formulaCount: formulas.length,
        images,
        imageCount: images.length,
      };
    } catch (error) {
      console.error("Error extracting elements from markdown:", error);
      return {
        formulas: [],
        formulaCount: 0,
        images: [],
        imageCount: 0,
        error: error.message,
      };
    }
  },
};

// ===================================================
// DOCUMENT STATUS UTILITIES
// ===================================================

/**
 * Document status utilities
 */
const DocumentUtils = {
  /**
   * Update document with error status
   * @param {Object} docRef - Firestore document reference
   * @param {string} errorMessage - Error message
   * @returns {Promise<void>}
   */
  async updateWithError(docRef, errorMessage) {
    try {
      await docRef.set(
        {
          smartStructure: {
            status: "error",
            error: errorMessage,
            processedAt: new Date(),
          },
        },
        { merge: true }
      );
      logger.info(`Document updated with error status: ${errorMessage}`);
    } catch (error) {
      logger.error(`Failed to update document with error status: ${error}`);
    }
  },

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
};

// ===================================================
// MISTRAL OCR PROCESSING
// ===================================================

/**
 * Process a PDF file using Mistral's OCR API and output the results.
 *
 * @param {Buffer} fileContent - PDF file content as a Buffer
 * @param {string} fileName - Original file name
 * @param {string} language - Optional language code
 * @param {string} userId - Optional user ID for tracing
 * @param {string} documentId - Optional document ID for tracing
 * @returns {Promise<Object>} - The processed content and metadata
 */
async function processPdfWithOcr(
  fileContent,
  fileName,
  language = null,
  userId = null,
  documentId = null
) {
  console.log(`Starting OCR processing for file: ${fileName}`);

  if (language) {
    console.log(`Document language detected: ${language}`);
  }

  // Use the tracing wrapper for the OCR process
  return tracedPdfMistralEngine({
    fileName,
    fileContent,
    language,
    userId: userId,
    documentId: documentId,
    functionName: "processPDF.mistral",
    processingFunction: async (trace) => {
      let uploadedFile = null;
      let tempFilePath = null;

      try {
        // Create a temporary file from the buffer
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, fileName);

        // Create a single span for file preparation and upload
        const prepareSpan = trace?.span({
          name: "prepare_and_upload",
          metadata: {
            fileSizeKB: Math.round(fileContent.length / 1024),
          },
        });

        // Write the buffer to a temporary file
        console.log(`Creating temporary file: ${tempFilePath}`);
        fs.writeFileSync(tempFilePath, fileContent);

        // Upload file to Mistral using openAsBlob
        console.log(`Uploading file to Mistral OCR API...`);
        const fileBlob = await openAsBlob(tempFilePath);
        uploadedFile = await mistralClient.files.upload({
          file: fileBlob,
          purpose: "ocr",
        });

        // Get signed URL for the uploaded file
        const signedUrl = await mistralClient.files.getSignedUrl({
          fileId: uploadedFile.id,
          expiry: 1,
        });

        // End the prepare span
        prepareSpan?.end({
          metadata: {
            fileId: uploadedFile.id,
          },
        });

        // Create a single span for OCR processing
        const processingSpan = trace?.span({
          name: "ocr_processing",
          metadata: {
            model: OCR_MODEL,
          },
        });

        console.log(`Processing with OCR model: ${OCR_MODEL}...`);

        // Process the PDF with OCR using the correct parameter structure
        const pdfResponse = await mistralClient.ocr.process({
          model: OCR_MODEL,
          document: {
            type: "document_url",
            documentUrl: signedUrl.url,
          },
          includeImageBase64: true,
        });

        // Parse the response
        const responseDict = JSON.parse(JSON.stringify(pdfResponse));

        // Concatenate markdown content from all pages
        const markdownContents =
          responseDict.pages?.map((page) => page.markdown || "") || [];
        const markdownText = markdownContents.join("\n\n");

        // End the processing span with page stats
        processingSpan?.end({
          metadata: {
            pageCount: responseDict.pages?.length || 0,
          },
        });

        // Create a single span for post-processing and cleanup
        const finalizingSpan = trace?.span({
          name: "finalizing",
        });

        // Process images for storage
        const images = [];
        const imageMap = {};

        // Extract images from the response
        for (const page of responseDict.pages || []) {
          for (const img of page.images || []) {
            console.log(
              `Found image with id: ${img.id}, has imageBase64: ${!!img.imageBase64}`
            );
            if (img.id && img.imageBase64) {
              let imageData = img.imageBase64;
              // Strip the prefix if it exists
              if (imageData.startsWith("data:image/")) {
                imageData = imageData.split(",", 2)[1];
              }

              // Generate a unique id for this image
              const imageId = img.id;

              // Add to the collection of images to save
              images.push({
                id: imageId,
                data: Buffer.from(imageData, "base64"),
              });

              console.log(`Successfully processed image: ${imageId}`);

              // Map for replacement in markdown - store only the ID for now
              // Full paths will be constructed later after we know uid and docId
              imageMap[imageId] = imageId;
            }
          }
        }

        // Replace image references in the markdown
        let processedMarkdown = markdownText;
        for (const [imgId, newPath] of Object.entries(imageMap)) {
          const imgIdEscaped = imgId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const imgPattern = new RegExp(
            `!\\[(.*?)\\]\\(${imgIdEscaped}\\)`,
            "g"
          );
          processedMarkdown = processedMarkdown.replace(
            imgPattern,
            `![Image: $1](${newPath})`
          );
        }

        console.log(
          `Finished processing OCR. Found ${images.length} images and ${responseDict.pages?.length || 0} pages.`
        );

        // Also handle cleanup in this same span
        try {
          // Clean up the uploaded file from Mistral
          if (uploadedFile) {
            await mistralClient.files.delete({ fileId: uploadedFile.id });
          }

          // Clean up the temporary file from disk
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (cleanupError) {
          console.warn(
            `Warning: Could not delete temporary file: ${cleanupError.message}`
          );
        }

        // End the finalizing span
        finalizingSpan?.end({
          metadata: {
            imageCount: images.length,
            markdownLength: processedMarkdown.length,
          },
        });

        return {
          markdown: processedMarkdown,
          images: images,
          imageCount: images.length,
          pageCount: responseDict.pages?.length || 0,
        };
      } catch (error) {
        // Create an error span if we have a trace
        if (trace) {
          trace.span({
            name: "ocr_processing_error",
            level: "ERROR",
            statusMessage: error.message,
            metadata: {
              error: error.message,
              errorType: error.constructor.name,
              stack: error.stack,
            },
          });
        }

        console.error(`Error in OCR processing:`, error);
        throw new Error(`OCR processing failed: ${error.message}`);
      }
    },
  });
}

// ===================================================
// DOCUMENT PROCESSING UTILITIES
// ===================================================

/**
 * Utilities for document processing
 */
const ProcessingUtils = {
  /**
   * Process PDF document and update Firestore
   * @param {Object} docRef - Firestore document reference
   * @param {Object} bucket - Storage bucket reference
   * @param {Buffer} fileContent - PDF file content
   * @param {string} uid - User ID
   * @param {string} docId - Document ID
   * @param {string} fileName - Original file name
   * @returns {Promise<Object>} Processing result
   */
  async processPdfDocument(docRef, bucket, fileContent, uid, docId, fileName) {
    try {
      // Get document data to access language if available
      const docSnapshot = await docRef.get();
      const docData = docSnapshot.data() || {};
      const documentLanguage = docData.language || null;

      // Process the PDF with Mistral OCR
      const ocrResult = await processPdfWithOcr(
        fileContent,
        fileName,
        documentLanguage,
        uid,
        docId
      );

      // Clean the markdown output before saving
      const cleanedMarkdown = MarkdownUtils.cleanMarkdown(ocrResult.markdown);

      // Create a clean version for smart view
      const cleanMarkdownForSmartView =
        MarkdownUtils.createCleanMarkdownForSmartView(cleanedMarkdown);

      // Save files and update Firestore with markdown results
      const markdownResult = await this.saveMarkdownFiles(
        docRef,
        bucket,
        cleanedMarkdown,
        cleanMarkdownForSmartView,
        fileContent,
        uid,
        docId,
        ocrResult.images
      );

      return markdownResult;
    } catch (processingError) {
      console.error("Error during processing:", processingError);
      console.error("Stack trace:", processingError.stack);
      await DocumentUtils.updateWithError(docRef, processingError.message);
      return {
        success: false,
        message: "Error processing PDF",
        error: processingError.message,
      };
    }
  },

  /**
   * Saves markdown files and images to storage and updates Firestore
   * @param {Object} docRef - Firestore document reference
   * @param {Object} bucket - Storage bucket reference
   * @param {string} cleanedMarkdown - Processed markdown content
   * @param {string} cleanMarkdownForSmartView - Clean version for smart view
   * @param {Buffer} fileContent - Original file content
   * @param {string} uid - User ID
   * @param {string} docId - Document ID
   * @param {Array} images - Array of extracted images
   * @returns {Promise<Object>} Result of operation
   */
  async saveMarkdownFiles(
    docRef,
    bucket,
    cleanedMarkdown,
    cleanMarkdownForSmartView,
    fileContent,
    uid,
    docId,
    images = []
  ) {
    // File names
    const markdownFileName = `${docId}_smartstructure.md`;
    const cleanMarkdownFileName = `${docId}_smartstructure_clean.md`;

    // Paths for storage using correct pattern: user/{uid}/docs/{docsid}/
    const markdownPath = `users/${uid}/docs/${docId}/smartstructure/${markdownFileName}`;
    const cleanMarkdownPath = `users/${uid}/docs/${docId}/smartstructure/${cleanMarkdownFileName}`;
    const imageBasePath = `users/${uid}/docs/${docId}/smartstructure/images/`;

    try {
      // Save both markdown files to Storage
      const markdownRef = bucket.file(markdownPath);
      const cleanMarkdownRef = bucket.file(cleanMarkdownPath);

      await markdownRef.save(cleanedMarkdown);
      await cleanMarkdownRef.save(cleanMarkdownForSmartView);

      // Save all extracted images
      const savedImagePaths = [];

      console.log(`Attempting to save ${images.length} images to storage`);

      for (const image of images) {
        const imagePath = `${imageBasePath}${image.id}`;
        console.log(`Saving image ${image.id} to path: ${imagePath}`);
        const imageRef = bucket.file(imagePath);
        await imageRef.save(image.data);
        savedImagePaths.push(imagePath);
        console.log(`Successfully saved image: ${image.id}`);
      }

      // Extract elements
      const extractedElements =
        await FormulaUtils.extractElements(cleanedMarkdown);

      // Add image paths to extracted elements
      extractedElements.imagePaths = savedImagePaths;

      // Update the document in Firestore with the markdown file path, metadata, and extracted elements
      await docRef.set(
        {
          smartStructure: {
            status: "completed",
            markdownPath: markdownPath,
            cleanMarkdownPath: cleanMarkdownPath,
            processedAt: new Date(),
            fileSize: fileContent.length,
            extractedElements: extractedElements,
          },
          // Mark TTS as ready but not processed
          tts: {
            status: "ready",
            cleanMarkdownPath: cleanMarkdownPath, // Store the path for later audio generation
            updatedAt: new Date(),
          },
        },
        { merge: true }
      );

      logger.info(`Document markdown processing completed: ${docId}`);

      // Result object to return
      return {
        success: true,
        message: "Markdown processing completed successfully",
        markdownPath,
        cleanMarkdownPath,
        extractedElements: extractedElements,
      };
    } catch (error) {
      console.error("Error saving markdown files:", error);
      await DocumentUtils.updateWithError(docRef, error.message);
      return {
        success: false,
        message: "Error saving markdown files",
        error: error.message,
      };
    }
  },

  /**
   * Validate PDF document size
   * @param {Object} docRef - Firestore document reference
   * @param {Buffer} fileContent - PDF file content
   * @returns {Promise<Object>} Validation result
   */
  async validatePdfSize(docRef, fileContent) {
    if (fileContent.length > MAX_PDF_SIZE_BYTES) {
      const fileSizeMB = (fileContent.length / (1024 * 1024)).toFixed(2);
      console.error(
        `Document exceeds maximum file size limit: ${fileSizeMB}MB`
      );

      const errorMessage = `Document exceeds ${MAX_PDF_SIZE_MB}MB size limit. Current size: ${fileSizeMB}MB`;

      // Update document status to reflect error for smartStructure only
      await docRef.update({
        smartStructure: {
          status: "error",
          error: errorMessage,
          processedAt: new Date(),
        },
      });

      return {
        isValid: false,
        error: `Document exceeds ${MAX_PDF_SIZE_MB}MB size limit. Please select a smaller document.`,
      };
    }

    return { isValid: true };
  },
};

/**
 * Main function to process a PDF file and generate smart structure
 * @param {Object} fileData - Object containing file information
 * @returns {Promise<Object>} - Object with information about the processed file
 */
export const processPdfFile = async (fileData) => {
  const { filePath, metadata } = fileData;
  const { userId: uid, docId } = metadata;
  const fileName = filePath.split("/").pop(); // Extract filename from path

  console.log("DEBUG: OCR processor - Processing file:", filePath);

  try {
    // Initialize Firebase services
    const db = getFirestore();
    const storage = getStorage();
    const bucket = storage.bucket();

    // 1. Get reference to the Firestore document
    const docRef = db.collection(`users/${uid}/docs`).doc(docId);

    // 2. Update status to processing for smartStructure only
    await docRef.update({
      smartStructure: {
        status: "processing",
        startedAt: new Date(),
      },
    });

    // 3. Get the file from storage
    const file = bucket.file(filePath);
    const [fileContent] = await file.download();

    // 4. Validate file size
    const sizeValidation = await ProcessingUtils.validatePdfSize(
      docRef,
      fileContent
    );
    if (!sizeValidation.isValid) {
      return {
        success: false,
        error: sizeValidation.error,
        smartStructureStatus: "error",
      };
    }

    // 5. Process the PDF document with OCR
    const result = await ProcessingUtils.processPdfDocument(
      docRef,
      bucket,
      fileContent,
      uid,
      docId,
      fileName
    );

    return result;
  } catch (error) {
    console.error("Error processing PDF file:", error);

    // If we have document reference, update with error status for markdown processing only
    try {
      const db = getFirestore();
      const docRef = db.collection(`users/${uid}/docs`).doc(docId);

      // Update error status for markdown processing
      await DocumentUtils.updateWithError(docRef, error.message);
    } catch (updateError) {
      console.error(
        "Failed to update document with error status:",
        updateError
      );
    }

    return {
      success: false,
      message: "Error processing PDF file",
      error: error.message,
      smartStructureStatus: "error",
    };
  }
};

/*
  Gemini PDF Processor Module
  This module processes PDF documents by transforming them into structured markdown using Gemini 2.0 AI.
  It's designed to be called from the onFileUpload trigger when a PDF is uploaded to the /docs/ path.
*/

/* global process, Buffer */
import { logger } from "firebase-functions";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { PDFDocument } from "pdf-lib";
import {
  tracedMultimodalPdfGeminiEngine,
  tracedMultimodalPdfGeminiEngineChunked,
} from "../../utils/observability.js";

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
const MAX_PDF_SIZE_MB = 200; // Maximum PDF size in MB
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024; // Convert to bytes
const MAX_CHUNK_SIZE_CHARS = 5000; // Maximum chunk size for SSML generation
const PAGES_PER_CHUNK = 5; // Estimated number of pages to process per Gemini call
const API_DELAY_MS = 500; // Delay between API calls to avoid rate limiting

// Regex patterns
const REGEX = {
  HEADING: /#{1,6} .+?$/gm,
  DISPLAY_FORMULA: /\$\$([^$]+)\$\$/g,
  INLINE_FORMULA: /(?<!\$)\$([^$]+)\$(?!\$)/g,
  IMAGE_TAG: /\{\{img\}\}(.*?)\{\{\/img\}\}/g,
  HTML_COMMENT: /<!--[\s\S]*?-->/g,
  CODE_BLOCK_START: /^```(?:markdown|xml)?\n/,
  CODE_BLOCK_END: /\n```$/,
};

// ===================================================
// PDF PROCESSING UTILITIES
// ===================================================

/**
 * Utility functions for PDF processing
 */
const PdfUtils = {
  /**
   * Splits a PDF buffer into multiple smaller PDFs
   * @param {Buffer} pdfBuffer - The original PDF buffer
   * @param {number} pagesPerChunk - Number of pages per chunk
   * @returns {Promise<Array<{buffer: Buffer, startPage: number, endPage: number}>>}
   */
  async splitPdfIntoChunks(pdfBuffer, pagesPerChunk = PAGES_PER_CHUNK) {
    try {
      // Load the PDF document
      const originalPdfDoc = await PDFDocument.load(pdfBuffer);
      const pageCount = originalPdfDoc.getPageCount();

      console.log(
        `PDF has ${pageCount} pages, splitting into chunks of ${pagesPerChunk} pages`
      );

      const chunks = [];

      // Create chunks of pages
      for (let i = 0; i < pageCount; i += pagesPerChunk) {
        const startPage = i;
        const endPage = Math.min(i + pagesPerChunk - 1, pageCount - 1);

        // Create a new PDF document for this chunk
        const chunkPdfDoc = await PDFDocument.create();

        // Copy the pages from the original document
        const copiedPages = await chunkPdfDoc.copyPages(
          originalPdfDoc,
          Array.from(
            { length: endPage - startPage + 1 },
            (_, j) => startPage + j
          )
        );

        // Add the copied pages to the new document
        copiedPages.forEach((page) => chunkPdfDoc.addPage(page));

        // Serialize the document to bytes
        const chunkBytes = await chunkPdfDoc.save();

        // Add the chunk to the array
        chunks.push({
          buffer: Buffer.from(chunkBytes),
          startPage: startPage + 1, // 1-indexed for readability
          endPage: endPage + 1, // 1-indexed for readability
        });
      }

      console.log(`Split PDF into ${chunks.length} chunks`);
      return chunks;
    } catch (error) {
      console.error("Error splitting PDF:", error);
      throw new Error(`Failed to split PDF: ${error.message}`);
    }
  },

  /**
   * Frees memory by clearing buffers from PDF chunks
   * @param {Array} pdfChunks - Array of PDF chunks with buffers
   */
  clearChunkBuffers(pdfChunks) {
    if (pdfChunks && pdfChunks.length) {
      for (let i = 0; i < pdfChunks.length; i++) {
        if (pdfChunks[i]) {
          pdfChunks[i].buffer = null;
        }
      }
    }
  },
};

/**
 * Utility functions for markdown processing
 */
const MarkdownUtils = {
  /**
   * Combine multiple markdown chunks into a single document
   * @param {Array<{markdown: string, startPage: number, endPage: number}>} markdownChunks
   * @returns {string} Combined markdown
   */
  combineMarkdownChunks(markdownChunks) {
    if (markdownChunks.length === 0) return "";
    if (markdownChunks.length === 1) return markdownChunks[0].markdown;

    // Sort chunks by page number
    markdownChunks.sort((a, b) => a.startPage - b.startPage);

    // Combine all chunks
    let combinedMarkdown = "";

    markdownChunks.forEach((chunk) => {
      let chunkText = chunk.markdown;

      // Add page number comments for better tracking
      combinedMarkdown += `\n\n<!-- Page ${chunk.startPage} - Page ${chunk.endPage} -->`;

      combinedMarkdown += chunkText;
    });

    return combinedMarkdown;
  },

  /**
   * Clean markdown by removing code block wrappers
   * @param {string} markdown - Markdown text to clean
   * @returns {string} Cleaned markdown
   */
  cleanMarkdown(markdown) {
    // Remove ```markdown at the start and ``` at the end if present
    if (markdown.startsWith("```markdown") || markdown.startsWith("```")) {
      markdown = markdown
        .replace(REGEX.CODE_BLOCK_START, "")
        .replace(REGEX.CODE_BLOCK_END, "");
    }

    // Remove <br/> tags that Gemini sometimes adds
    markdown = markdown.replace(/<br\/>/g, "");

    // Apply progressive numbering to consecutive repeated headings
    markdown = this.addProgressiveNumberingToRepeatedHeadings(markdown);

    return markdown;
  },

  /**
   * Add progressive numbering to consecutive repeated headings
   * @param {string} markdown - Markdown text to process
   * @returns {string} Markdown with numbered headings
   */
  addProgressiveNumberingToRepeatedHeadings(markdown) {
    // Extract all headings with their positions
    const headings = [];
    let match;
    const headingRegex = /^(#{1,6}\s+)(.+?)(\s*)$/gm;

    while ((match = headingRegex.exec(markdown)) !== null) {
      headings.push({
        fullMatch: match[0], // The entire heading line
        prefix: match[1], // The #'s plus space
        text: match[2], // The heading text
        suffix: match[3] || "", // Any trailing whitespace
        index: match.index, // Position in the string
        length: match[0].length, // Length of the full match
      });
    }

    // Process headings to add numbers to consecutive duplicates
    const headingCounts = {};
    const modifications = [];

    for (let i = 0; i < headings.length; i++) {
      const currentHeading = headings[i];
      const currentText = currentHeading.text;

      // Reset count if this heading follows a different heading
      if (i > 0 && headings[i - 1].text !== currentText) {
        delete headingCounts[currentText];
      }

      // Initialize counter for this heading text if not exists
      if (!headingCounts[currentText]) {
        headingCounts[currentText] = 1;
      } else {
        // Increment counter for duplicates
        headingCounts[currentText]++;

        // Create a modified heading with number for duplicates
        const newText = `${currentText} (${headingCounts[currentText]})`;
        const newFullMatch = `${currentHeading.prefix}${newText}${currentHeading.suffix}`;

        modifications.push({
          index: currentHeading.index,
          length: currentHeading.length,
          replacement: newFullMatch,
        });
      }
    }

    // Apply modifications in reverse order to not affect indices
    modifications.sort((a, b) => b.index - a.index);

    let result = markdown;
    for (const mod of modifications) {
      result =
        result.substring(0, mod.index) +
        mod.replacement +
        result.substring(mod.index + mod.length);
    }

    return result;
  },

  /**
   * Creates a clean version of markdown for text-to-speech
   * @param {string} markdown - Original markdown content
   * @returns {string} Clean markdown for TTS
   */
  createCleanMarkdownForTTS(markdown) {
    // Make a copy of the markdown
    let cleanMarkdown = markdown;

    // Replace HTML comments with minimal spacing
    cleanMarkdown = cleanMarkdown.replace(REGEX.HTML_COMMENT, " ");

    // Transform image tags to [Figure: description] format
    cleanMarkdown = cleanMarkdown.replace(REGEX.IMAGE_TAG, "\n[Figure: $1]\n");

    // Remove excessive whitespace and newlines
    cleanMarkdown = cleanMarkdown.replace(/\n{3,}/g, "\n\n"); // Replace 3+ newlines with 2

    return cleanMarkdown;
  },

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
// GEMINI AI PDF PROCESSING
// ===================================================

/**
 * PDF to Markdown conversion utilities
 */
const PdfMarkdownUtils = {
  /**
   * Convert a PDF chunk to markdown using Gemini
   * @param {Buffer} pdfBuffer - Buffer containing PDF data
   * @param {Object} pageInfo - Page range information
   * @param {string|null} language - Document language if known
   * @param {Object|null} parentTrace - Optional parent trace for hierarchical tracing
   * @returns {Promise<string>} Converted markdown
   */
  async convertPdfChunkToMarkdown(
    pdfBuffer,
    pageInfo,
    language = null,
    parentTrace = null
  ) {
    try {
      // Initialize the Gemini model
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-lite",
      });

      // Build the prompt with appropriate instructions
      const prompt = this.buildMarkdownPrompt(pageInfo, language);

      // Use traced multimodal processing
      const result = await tracedMultimodalPdfGeminiEngine({
        model,
        prompt,
        pdfBuffer,
        pageInfo,
        functionName: "processPDF.gemini",
        userId: "system", // Since this is a system process with no specific user
        documentId: pageInfo
          ? `pages_${pageInfo.startPage}_${pageInfo.endPage}`
          : "unknown",
        metadata: {
          language,
          pageStart: pageInfo?.startPage,
          pageEnd: pageInfo?.endPage,
        },
        parentTrace,
      });

      // Clean the markdown by removing triple backtick code blocks if present
      const markdown = MarkdownUtils.cleanMarkdown(result.text);

      return markdown;
    } catch (error) {
      console.error(
        `Error converting PDF chunk to markdown (pages ${pageInfo.startPage}-${pageInfo.endPage}):`,
        error
      );
      throw new Error(
        `Gemini API error for pages ${pageInfo.startPage}-${pageInfo.endPage}: ${error.message}`
      );
    }
  },

  /**
   * Builds the prompt for markdown conversion
   * @param {Object} pageInfo - Page range information
   * @param {string|null} language - Document language if known
   * @returns {string} Prompt for Gemini model
   */
  buildMarkdownPrompt(pageInfo, language) {
    // Determine language instruction
    const languageInstruction = language
      ? language === "it"
        ? "in ITALIAN"
        : "in ENGLISH"
      : "";

    // Construct the complete prompt
    return (
      `Please convert this PDF slide presentation to well-structured markdown optimized for student study materials ${languageInstruction}. This is a presentation/slide document, so focus on TRANSFORMING the slides into a readable linear format rather than preserving the original layout. Follow these specific requirements:\n\n` +
      "TRANSFORMATION APPROACH:\n" +
      "1. Your goal is to create a readable, study-friendly document - NOT to preserve the original slide layout\n" +
      "2. Reorganize complex slide layouts (multi-column, text boxes, etc.) into a logical linear reading flow\n" +
      "3. Extract key information from visually complex slides and present it in a clean, organized structure\n" +
      "4. Focus on content hierarchy rather than visual arrangement\n\n" +
      "SLIDE CONTENT STRUCTURE:\n" +
      "1. Format each slide title as a level 2 heading (##) to create clear slide divisions\n" +
      "2. Preserve content hierarchy within each slide (slide title → subtitles → bullet points → details)\n" +
      "3. Maintain bullet points and numbered lists, enhancing them for better readability when needed\n" +
      "4. Ensure proper whitespace between slides to enhance readability\n" +
      `5. For images, diagrams or charts: Briefly describe them using the format {{img}}Brief description of what the image shows{{/img}}. Write the description ${languageInstruction}. Use LaTeX in description if needed.\n` +
      "   Example: {{img}}A diagram showing the water cycle with arrows indicating evaporation, condensation, and precipitation{{/img}}\n" +
      "   - For diagrams/charts: Focus on explaining what the diagram is showing conceptually\n" +
      "   - For photographs: Describe what is visible and its educational relevance\n" +
      "   - If an image contains mathematical equations, recreate them using LaTeX in the markdown\n" +
      "   - If text overlaps with images, prioritize capturing the text content correctly\n" +
      "6. For tables: Convert to markdown table format rather than describing them\n" +
      "7. Use standard markdown formatting for emphasis (bold, italic, underlined text)\n" +
      "8. Ignore slide numbers, footers, or any decorative elements\n\n" +
      "SLIDE-SPECIFIC CONSIDERATIONS:\n" +
      "1. Each slide should be self-contained - don't attempt to create continuity between slides\n" +
      "2. Recognize that text in slides may appear in various positions and layouts - focus on logical ordering\n" +
      "3. If slides have complex layouts with multiple columns or text boxes, organize the content in a logical reading order\n" +
      "4. Preserve any emphasis by using bold/italic markdown\n\n" +
      "SPECIAL ELEMENT TAGGING SYSTEM:\n" +
      "Mathematical formulas: Use standard LaTeX delimiters\n" +
      "   - For inline formulas use single dollar signs: $E = mc^2$\n" +
      "   - For display formulas use double dollar signs: $$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n" +
      "IMPORTANT GUIDELINES:\n" +
      "1. Focus ONLY on tagging mathematical formulas and images\n" +
      "2. Apply these img and latex tags CONSISTENTLY throughout the document\n" +
      "3. Make sure all tags are properly closed\n" +
      "4. For all other content, use standard markdown without special tags\n" +
      "5. Improve the markdown structure wherever possible WITHOUT changing the content's meaning\n" +
      "6. Prioritize completeness - capture ALL text content from the slides\n\n" +
      `The output should be ONLY clean, well-structured markdown with consistent special element tags, optimized for easy reading and studying from presentation slides. All the text should be ${languageInstruction}.`
    );
  },

  /**
   * Convert entire PDF to markdown by processing chunks
   * @param {Buffer} pdfBuffer - Buffer containing PDF data
   * @param {string|null} language - Document language if known
   * @param {string|null} userId - User ID if available
   * @param {string|null} documentId - Document ID if available
   * @returns {Promise<string>} Combined markdown from all chunks
   */
  async convertPdfToMarkdown(
    pdfBuffer,
    language = null,
    userId = null,
    documentId = null
  ) {
    let pdfChunks = [];
    try {
      console.log(
        `Starting PDF conversion to markdown (${Math.round(pdfBuffer.length / 1024)} KB)`
      );

      // Split the PDF into manageable chunks
      pdfChunks = await PdfUtils.splitPdfIntoChunks(pdfBuffer, PAGES_PER_CHUNK);
      console.log(`PDF split into ${pdfChunks.length} chunks`);

      // Use chunked processing with tracing
      const processingResult = await tracedMultimodalPdfGeminiEngineChunked({
        pdfChunks,
        processingFunction: async (chunk, index, parentTrace) => {
          console.log(
            `Processing chunk ${index + 1}/${pdfChunks.length} (pages ${chunk.startPage}-${chunk.endPage})`
          );

          // Process the chunk with tracing
          const markdown = await this.convertPdfChunkToMarkdown(
            chunk.buffer,
            {
              startPage: chunk.startPage,
              endPage: chunk.endPage,
            },
            language,
            parentTrace
          );

          // Clear buffer from memory after processing to free up RAM
          if (index > 0) {
            // We don't need the previous chunk's buffer anymore
            pdfChunks[index - 1].buffer = null;
          }

          // Add a small delay between API calls to avoid rate limiting
          if (index < pdfChunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS));
          }

          // Return the processed chunk
          return {
            markdown,
            startPage: chunk.startPage,
            endPage: chunk.endPage,
          };
        },
        functionName: "processPDF.gemini",
        userId: userId,
        documentId: documentId,
        metadata: {
          language,
          // Remove duplicate totalSizeKB and add more descriptive metrics
          originalFileSizeKB: Math.round(pdfBuffer.length / 1024),
          fileType: "application/pdf",
        },
      });

      // Get the markdownChunks from the processing result
      const markdownChunks = processingResult.markdownChunks;

      // Combine all markdown chunks into a single document
      console.log("Combining markdown chunks...");
      const combinedMarkdown =
        MarkdownUtils.combineMarkdownChunks(markdownChunks);
      console.log(
        `Combined markdown: ${Math.round(combinedMarkdown.length / 1024)} KB`
      );

      return combinedMarkdown;
    } catch (error) {
      console.error(`Error in PDF to markdown conversion:`, error);
      console.error(error.stack);
      throw new Error(`Complete PDF conversion failed: ${error.message}`);
    } finally {
      // Clean up memory
      PdfUtils.clearChunkBuffers(pdfChunks);
    }
  },
};

/**
 * Utilities for formula extraction and content tagging
 */
const FormulaUtils = {
  /**
   * Check if LaTeX formula is an equation (contains an equals sign)
   * @param {string} latex - LaTeX formula to check
   * @returns {boolean} True if it's a proper formula
   */
  isProperFormula(latex) {
    // Skip single variables like $x$, $y$, $z$, $\alpha$ etc.
    if (/^[a-zA-Z]$/.test(latex) || /^\\[a-zA-Z]+$/.test(latex)) {
      return false;
    }

    // Only accept formulas that contain an equals sign
    return latex.includes("=");
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

      // Flattened structure with formulas and count
      return {
        formulas,
        formulaCount: formulas.length,
      };
    } catch (error) {
      console.error("Error extracting elements from markdown:", error);
      return {
        formulas: [],
        formulaCount: 0,
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
   * @returns {Promise<Object>} Processing result
   */
  async processPdfDocument(docRef, bucket, fileContent, uid, docId) {
    try {
      // Get document data to access language if available
      const docSnapshot = await docRef.get();
      const docData = docSnapshot.data() || {};
      const documentLanguage = docData.language || null;

      // Process the PDF with Gemini to convert to markdown, passing user and doc IDs for tracing
      const markdown = await PdfMarkdownUtils.convertPdfToMarkdown(
        fileContent,
        documentLanguage,
        uid,
        docId
      );

      // Clean the markdown output before saving
      const cleanedMarkdown = MarkdownUtils.cleanMarkdown(markdown);

      // Create a clean version for text-to-speech
      const cleanMarkdownForTTS =
        MarkdownUtils.createCleanMarkdownForTTS(cleanedMarkdown);

      // Save files and update Firestore with markdown results
      const markdownResult = await this.saveMarkdownFiles(
        docRef,
        bucket,
        cleanedMarkdown,
        cleanMarkdownForTTS,
        fileContent,
        uid,
        docId
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
   * Saves markdown files to storage and updates Firestore
   * @param {Object} docRef - Firestore document reference
   * @param {Object} bucket - Storage bucket reference
   * @param {string} cleanedMarkdown - Processed markdown content
   * @param {string} cleanMarkdownForTTS - Clean version for TTS
   * @param {Buffer} fileContent - Original file content
   * @param {string} uid - User ID
   * @param {string} docId - Document ID
   * @returns {Promise<Object>} Result of operation
   */
  async saveMarkdownFiles(
    docRef,
    bucket,
    cleanedMarkdown,
    cleanMarkdownForTTS,
    fileContent,
    uid,
    docId
  ) {
    // File names
    const markdownFileName = `${docId}_smartstructure.md`;
    const cleanMarkdownFileName = `${docId}_smartstructure_clean.md`;

    // Paths for storage using correct pattern: user/{uid}/docs/{docsid}/
    const markdownPath = `users/${uid}/docs/${docId}/smartstructure/${markdownFileName}`;
    const cleanMarkdownPath = `users/${uid}/docs/${docId}/smartstructure/${cleanMarkdownFileName}`;

    try {
      // Save both files to Storage
      const markdownRef = bucket.file(markdownPath);
      const cleanMarkdownRef = bucket.file(cleanMarkdownPath);

      await markdownRef.save(cleanedMarkdown);
      await cleanMarkdownRef.save(cleanMarkdownForTTS);

      // Extract elements
      const extractedElements =
        await FormulaUtils.extractElements(cleanedMarkdown);

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

  // The processTTS function has been moved to audioGenerator.js

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
        // Don't set tts status on error, as we haven't even started TTS processing
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

  console.log("DEBUG: PDF processor - Processing file:", filePath);

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
      // We'll set tts status to "ready" only after we've successfully created the clean markdown
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

    // 5. Process the PDF document for markdown only (no TTS)
    // Pass the user ID and document ID for tracing purposes
    const docSnapshot = await docRef.get();
    const docData = docSnapshot.data() || {};
    const documentLanguage = docData.language || null;

    // Process the PDF with Gemini to convert to markdown
    const markdown = await PdfMarkdownUtils.convertPdfToMarkdown(
      fileContent,
      documentLanguage,
      uid,
      docId
    );

    // Clean the markdown output before saving
    const cleanedMarkdown = MarkdownUtils.cleanMarkdown(markdown);

    // Create a clean version for text-to-speech
    const cleanMarkdownForTTS =
      MarkdownUtils.createCleanMarkdownForTTS(cleanedMarkdown);

    // Save markdown files and update Firestore
    const markdownResult = await ProcessingUtils.saveMarkdownFiles(
      docRef,
      bucket,
      cleanedMarkdown,
      cleanMarkdownForTTS,
      fileContent,
      uid,
      docId
    );

    return markdownResult;
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

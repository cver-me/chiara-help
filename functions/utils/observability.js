/* global process */
import { Langfuse } from "langfuse";

// Check if running in the emulator
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

// Determine environment based on the emulator flag
const environment = isEmulator ? "emulator" : "production";

// Singleton Langfuse client
let langfuseClient = null;

/**
 * Initialize the Langfuse client
 * @returns {Langfuse|null} Langfuse client or null if initialization fails
 */
export const initLangfuse = () => {
  if (langfuseClient) {
    return langfuseClient;
  }

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    console.warn(
      "Langfuse API keys not found. LLM observability will be disabled."
    );
    return null;
  }

  try {
    langfuseClient = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com",
      environment: environment,
    });

    return langfuseClient;
  } catch (error) {
    console.error("Failed to initialize Langfuse client:", error);
    return null;
  }
};

/**
 * Flush traces to Langfuse server
 * @returns {Promise<void>}
 */
export const flushTraces = async () => {
  if (!langfuseClient) return;

  try {
    await langfuseClient.flushAsync();
    // console.log("Langfuse traces flushed successfully");
  } catch (error) {
    console.error("Error flushing Langfuse traces:", error);
  }
};

/**
 * Create a trace for an operation
 * @param {string} name - Name of the trace (operation)
 * @param {string} userId - User ID
 * @param {Object} metadata - Additional metadata for the trace
 * @returns {Object|null} Trace object or null if Langfuse is disabled
 */
export const createTrace = (name, userId, metadata = {}) => {
  const client = langfuseClient || initLangfuse();
  if (!client) return null;

  return client.trace({
    name,
    userId,
    metadata: {
      ...metadata,
    },
  });
};

/**
 * Wrapper for Google Generative AI calls with Langfuse tracing
 * @param {object} params - Parameters for the operation
 * @returns {Promise<object>} Results with trace information
 */
export const tracedGenerativeAI = async ({
  model,
  prompt,
  functionName,
  userId,
  documentId,
  membershipTier,
  metadata = {},
  parentTrace = null, // New parameter to support hierarchical tracing
}) => {
  const client = langfuseClient || initLangfuse();
  if (!client) {
    // Just call the model without tracing if Langfuse is not available
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return {
      text: response.text(),
      usage: null,
      traceId: null,
    };
  }

  // Use provided trace or create a new one
  const trace =
    parentTrace ||
    createTrace(functionName, userId, {
      documentId,
      membershipTier,
      ...metadata,
    });

  // Get token count for the prompt
  let tokenUsage = null;
  try {
    const tokenCount = await model.countTokens(prompt);
    tokenUsage = {
      promptTokens: tokenCount.totalTokens,
      completionTokens: 0, // Will be updated after generation
      totalTokens: tokenCount.totalTokens, // Will be updated after generation
    };
  } catch (tokenError) {
    console.warn(`Failed to count tokens: ${tokenError.message}`);
    // Log the token counting error to Langfuse as a warning
    trace.span({
      name: "token_count_error",
      level: "WARNING",
      statusMessage: `Token counting failed: ${tokenError.message}`,
      metadata: {
        error: tokenError.message,
        errorType: tokenError.constructor.name,
        stack: tokenError.stack,
      },
    });
  }

  // Create a generation
  const generation = trace.generation({
    name: parentTrace
      ? `${functionName}.chunk.generate`
      : `${functionName}.generate`,
    model: (model.model || "").split("/").pop(),
    input: prompt,
    metadata: {
      ...metadata,
    },
  });

  try {
    // Call the model
    const result = await model.generateContent(prompt);
    const response = await result.response;

    // Get the output text
    const text = response.text();

    // Try to count tokens in the response too
    try {
      if (tokenUsage) {
        const outputTokenCount = await model.countTokens(text);
        tokenUsage.completionTokens = outputTokenCount.totalTokens;
        tokenUsage.totalTokens =
          tokenUsage.promptTokens + tokenUsage.completionTokens;
      }
    } catch (tokenError) {
      console.warn(`Failed to count output tokens: ${tokenError.message}`);
      // Log this error to Langfuse as a warning too
      trace.span({
        name: "output_token_count_error",
        level: "WARNING",
        statusMessage: `Output token counting failed: ${tokenError.message}`,
        metadata: {
          error: tokenError.message,
          errorType: tokenError.constructor.name,
        },
      });
    }

    // End the generation
    generation.end({
      output: text,
      metadata: {
        ...metadata,
      },
      usage: tokenUsage
        ? {
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
          }
        : undefined,
    });

    // Only flush if this is not part of a parent trace
    // For parent traces, the flush will be called at the end of the full operation
    if (!parentTrace) {
      await flushTraces();
    }

    // Return the result
    return {
      text,
      usage: tokenUsage,
      traceId: trace.id,
    };
  } catch (error) {
    console.error(`Error in AI generation: ${error.message}`);

    // Log the error to Langfuse trace with proper error level
    trace.span({
      name: "ai_generation_error",
      level: "ERROR",
      statusMessage: error.message,
      metadata: {
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
        statusCode: error.status || error.statusCode,
        details: error.errorDetails || error.details,
        modelName: model.model,
      },
    });

    // End the generation with error status
    generation.end({
      error: {
        message: error.message,
        stack: error.stack,
        statusCode: error.status || error.statusCode,
        details: JSON.stringify(error.errorDetails || error.details || {}),
      },
      status: "error", // Explicitly set status to error
    });

    // Only flush if this is not part of a parent trace
    if (!parentTrace) {
      await flushTraces();
    }

    // Re-throw
    throw error;
  }
};

/**
 * Process multiple chunks with a parent trace for hierarchical tracing
 * @param {object} params - Parameters for the chunked operation
 * @returns {Promise<object>} Combined results with trace information
 */
export const tracedGenerativeAIChunked = async ({
  chunks,
  processingFunction,
  functionName,
  userId,
  documentId,
  membershipTier,
  metadata = {},
  parentTrace = null,
}) => {
  const client = langfuseClient || initLangfuse();

  // Use the provided parentTrace or create a new one
  const effectiveParentTrace =
    parentTrace ||
    createTrace(functionName, userId, {
      documentId,
      membershipTier,
      chunkCount: chunks.length,
      totalContentLength: chunks.reduce(
        (total, chunk) => total + chunk.text.length,
        0
      ),
      ...metadata,
    });

  if (!client || !effectiveParentTrace) {
    // Process without tracing if Langfuse is not available
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const result = await processingFunction(chunks[i], i, null);
      results.push(result);
    }
    return {
      results,
      traceId: null,
      combinedUsage: null,
    };
  }

  try {
    // Remove the chunk_processing span as it duplicates information

    const results = [];
    let combinedUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    // Process each chunk using the provided processing function
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Create a span for this specific chunk
      const chunkSpan = effectiveParentTrace.span({
        name: `chunk_${i + 1}_of_${chunks.length}`,
        metadata: {
          chunkIndex: i + 1,
          totalChunks: chunks.length,
          chunkLength: chunk.text.length,
          ...chunk.metadata,
        },
      });

      try {
        // Process this chunk using the provided function
        // The processing function should call tracedGenerativeAI with parentTrace
        const result = await processingFunction(chunk, i, effectiveParentTrace);

        // Add chunk result and aggregate token usage
        results.push(result);

        if (result.usage) {
          combinedUsage.promptTokens += result.usage.promptTokens || 0;
          combinedUsage.completionTokens += result.usage.completionTokens || 0;
          combinedUsage.totalTokens += result.usage.totalTokens || 0;
        }

        // End the chunk span successfully
        chunkSpan.end({
          metadata: {
            success: true,
            tokenUsage: result.usage,
          },
        });
      } catch (error) {
        // End the chunk span with error
        chunkSpan.end({
          level: "ERROR",
          statusMessage: error.message,
          metadata: {
            error: error.message,
            errorType: error.constructor.name,
          },
        });

        // Re-throw to handle in the outer try/catch
        throw error;
      }
    }

    // Add a span with combined results summary
    effectiveParentTrace.span({
      name: "combined_results",
      metadata: {
        totalChunks: chunks.length,
        resultCount: results.length,
      },
    });

    // Flush traces
    if (!parentTrace) {
      // Only flush if this function created the trace
      await flushTraces();
    }

    // Return combined results
    return {
      results,
      traceId: effectiveParentTrace.id,
      combinedUsage,
    };
  } catch (error) {
    // Log the overall error
    effectiveParentTrace.span({
      name: "chunked_processing_error",
      level: "ERROR",
      statusMessage: error.message,
      metadata: {
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
      },
    });

    // Flush traces even on error
    await flushTraces();

    // Re-throw
    throw error;
  }
};

/**
 * Specialized tracing function for Gemini PDF processing engine with multimodal content
 * This function handles the unique case of processing PDFs where we want to trace
 * the operation without sending the actual PDF content to Langfuse
 *
 * @param {object} params - Parameters for the PDF processing operation
 * @returns {Promise<object>} Results with trace information
 */
export const tracedMultimodalPdfGeminiEngine = async ({
  model,
  prompt,
  pdfBuffer,
  pageInfo,
  functionName,
  userId,
  documentId,
  metadata = {},
  parentTrace = null,
}) => {
  const client = langfuseClient || initLangfuse();
  if (!client) {
    // Just call the model without tracing if Langfuse is not available
    // Create the image part for the model (without sending to Langfuse)
    const imagePart = {
      inlineData: {
        data: pdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    return {
      text: response.text(),
      usage: null,
      traceId: null,
    };
  }

  // Use provided trace or create a new one with PDF metadata (not content)
  const trace =
    parentTrace ||
    createTrace(functionName, userId, {
      documentId,
      pdfMetadata: {
        sizeKB: Math.round(pdfBuffer.length / 1024),
        pageRange: pageInfo
          ? `${pageInfo.startPage}-${pageInfo.endPage}`
          : null,
      },
      ...metadata,
    });

  // Estimate token usage for the prompt (we can only count the text part)
  let tokenUsage = null;
  try {
    const tokenCount = await model.countTokens(prompt);
    tokenUsage = {
      promptTokens: tokenCount.totalTokens,
      promptEstimated: true, // Flag that this is just the text part
      completionTokens: 0, // Will be updated after generation
      totalTokens: tokenCount.totalTokens, // Will be updated after generation
    };
  } catch (tokenError) {
    console.warn(`Failed to count tokens: ${tokenError.message}`);
    // Log the token counting error to Langfuse as a warning
    trace.span({
      name: "token_count_error",
      level: "WARNING",
      statusMessage: `Token counting failed: ${tokenError.message}`,
      metadata: {
        error: tokenError.message,
        errorType: tokenError.constructor.name,
      },
    });
  }

  // Create a generation entry in Langfuse
  // Note: We only send the text prompt to Langfuse, not the PDF data
  const generation = trace.generation({
    name: parentTrace
      ? `${functionName}.chunk.generate`
      : `${functionName}.generate`,
    model: (model.model || "").split("/").pop(),
    input: prompt, // Only sending the text prompt to Langfuse
    metadata: {
      hasPdfAttachment: true,
      pdfSize: Math.round(pdfBuffer.length / 1024) + "KB",
      pageInfo: pageInfo || null,
      ...metadata,
    },
  });

  try {
    // Create the image part for the model (without sending to Langfuse)
    const imagePart = {
      inlineData: {
        data: pdfBuffer.toString("base64"),
        mimeType: "application/pdf",
      },
    };

    // Call the model with both the prompt and PDF data
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;

    // Get the output text
    const text = response.text();

    // Try to count tokens in the response
    try {
      if (tokenUsage) {
        const outputTokenCount = await model.countTokens(text);
        tokenUsage.completionTokens = outputTokenCount.totalTokens;
        tokenUsage.totalTokens =
          tokenUsage.promptTokens + tokenUsage.completionTokens;
      }
    } catch (tokenError) {
      console.warn(`Failed to count output tokens: ${tokenError.message}`);
      // Log this error to Langfuse as a warning
      trace.span({
        name: "output_token_count_error",
        level: "WARNING",
        statusMessage: `Output token counting failed: ${tokenError.message}`,
        metadata: {
          error: tokenError.message,
          errorType: tokenError.constructor.name,
        },
      });
    }

    // End the generation with success
    generation.end({
      output: text,
      metadata: {
        outputLength: text.length,
        ...metadata,
      },
      usage: tokenUsage
        ? {
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
          }
        : undefined,
    });

    // Only flush if this is not part of a parent trace
    if (!parentTrace) {
      await flushTraces();
    }

    // Return the result
    return {
      text,
      usage: tokenUsage,
      traceId: trace.id,
    };
  } catch (error) {
    console.error(`Error in multimodal PDF processing: ${error.message}`);

    // Log the error to Langfuse trace
    trace.span({
      name: "pdf_processing_error",
      level: "ERROR",
      statusMessage: error.message,
      metadata: {
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
        statusCode: error.status || error.statusCode,
        modelName: model.model,
      },
    });

    // End the generation with error status
    generation.end({
      error: {
        message: error.message,
        stack: error.stack,
        statusCode: error.status || error.statusCode,
        details: JSON.stringify(error.errorDetails || error.details || {}),
      },
      status: "error",
    });

    // Only flush if this is not part of a parent trace
    if (!parentTrace) {
      await flushTraces();
    }

    // Re-throw
    throw error;
  }
};

/**
 * Specialized tracing function for Gemini PDF processing engine with multimodal content and chunking
 * Process PDF in multiple chunks with hierarchical tracing
 * @param {object} params - Parameters for the chunked PDF processing operation
 * @returns {Promise<object>} Combined results with trace information
 */
export const tracedMultimodalPdfGeminiEngineChunked = async ({
  pdfChunks,
  processingFunction,
  functionName,
  userId,
  documentId,
  metadata = {},
}) => {
  const client = langfuseClient || initLangfuse();

  // Create a parent trace for the entire PDF processing operation
  const parentTrace = createTrace(functionName, userId, {
    documentId,
    pdfMetadata: {
      totalChunks: pdfChunks.length,
      totalPages: pdfChunks.reduce(
        (total, chunk) => total + (chunk.endPage - chunk.startPage + 1),
        0
      ),
      chunkedSizeKB: pdfChunks.reduce(
        (total, chunk) => total + Math.round(chunk.buffer.length / 1024),
        0
      ),
    },
    ...metadata,
  });

  if (!client || !parentTrace) {
    // Process without tracing if Langfuse is not available
    const markdownChunks = [];
    for (let i = 0; i < pdfChunks.length; i++) {
      const result = await processingFunction(pdfChunks[i], i, null);
      markdownChunks.push(result);
    }
    return {
      markdownChunks,
      traceId: null,
    };
  }

  try {
    const markdownChunks = [];

    // Process each PDF chunk
    for (let i = 0; i < pdfChunks.length; i++) {
      const chunk = pdfChunks[i];

      // Create a span for this specific chunk
      const chunkSpan = parentTrace.span({
        name: `pdf_chunk_${i + 1}_of_${pdfChunks.length}`,
        metadata: {
          chunkIndex: i + 1,
          totalChunks: pdfChunks.length,
          pageRange: `${chunk.startPage}-${chunk.endPage}`,
          sizeKB: Math.round(chunk.buffer.length / 1024),
        },
      });

      try {
        // Process this chunk using the provided function
        // The function should use tracedMultimodalPdfProcessing with parentTrace
        const chunkResult = await processingFunction(chunk, i, parentTrace);

        // Add chunk result
        markdownChunks.push(chunkResult);

        // End the chunk span successfully
        chunkSpan.end({
          metadata: {
            success: true,
            outputLength: chunkResult.text ? chunkResult.text.length : 0,
          },
        });
      } catch (error) {
        // End the chunk span with error
        chunkSpan.end({
          level: "ERROR",
          statusMessage: error.message,
          metadata: {
            error: error.message,
            errorType: error.constructor.name,
          },
        });

        // Continue with other chunks despite errors
        markdownChunks.push({
          markdown: `\n\n<!-- Error converting pages ${chunk.startPage}-${chunk.endPage}: ${error.message} -->`,
          startPage: chunk.startPage,
          endPage: chunk.endPage,
          error: error.message,
        });
      }
    }

    // Add a span with combined results summary
    parentTrace.span({
      name: "pdf_processing_summary",
      metadata: {
        totalChunks: pdfChunks.length,
        processedChunks: markdownChunks.length,
        successfulChunks: markdownChunks.filter((chunk) => !chunk.error).length,
        failedChunks: markdownChunks.filter((chunk) => chunk.error).length,
      },
    });

    // Flush traces
    await flushTraces();

    // Return combined results
    return {
      markdownChunks,
      traceId: parentTrace.id,
    };
  } catch (error) {
    // Log the overall error
    parentTrace.span({
      name: "pdf_processing_error",
      level: "ERROR",
      statusMessage: error.message,
      metadata: {
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
      },
    });

    // Flush traces even on error
    await flushTraces();

    // Re-throw
    throw error;
  }
};

/**
 * Specialized tracing function for Mistral OCR PDF processing
 * This function handles tracing for PDF processing with Mistral's OCR API
 * without sending any sensitive content to Langfuse
 *
 * @param {object} params - Parameters for the OCR processing
 * @returns {Promise<object>} Results with trace information
 */
export const tracedPdfMistralEngine = async ({
  fileName,
  fileContent,
  language,
  userId,
  documentId,
  functionName,
  processingFunction,
  metadata = {},
}) => {
  const client = langfuseClient || initLangfuse();

  // Calculate file size in KB for metadata
  const fileSizeKB = Math.round(fileContent.length / 1024);

  // Create a trace for the OCR processing
  const trace = client
    ? createTrace(functionName, userId, {
        documentId,
        pdfMetadata: {
          fileSizeKB,
          language,
          // We only include the file extension and not the full name for privacy
          fileExtension: fileName.split(".").pop().toLowerCase(),
        },
        ...metadata,
      })
    : null;

  if (!client || !trace) {
    // If Langfuse is not available, just call the processing function directly
    return await processingFunction(null);
  }

  try {
    // Create a generation at the START of the process and let Langfuse handle timing
    const generation = trace.generation({
      name: `${functionName}.ocr`,
      model: "mistral-ocr",
      input: `PDF document (${fileSizeKB}KB)`, // Don't include actual content
      metadata: {
        language,
        ...metadata,
      },
    });

    // Call the processing function and pass the trace for adding spans
    const result = await processingFunction(trace);

    // End the generation with success status and usage details
    generation.end({
      output: `Processed ${result.pageCount || 0} pages with ${result.imageCount || 0} images`,
      usageDetails: {
        // Add page count as a usage metric
        pages: result.pageCount,
      },
    });

    // Flush traces
    await flushTraces();

    // Return the result
    return {
      ...result,
      traceId: trace.id,
    };
  } catch (error) {
    console.error(`Error in Mistral OCR processing: ${error.message}`);

    // Create an error span
    trace.span({
      name: "ocr_error",
      level: "ERROR",
      statusMessage: error.message,
      metadata: {
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
      },
    });

    // If we have a generation reference, end it with error status
    // Otherwise create a new one with error
    trace.generation({
      name: `${functionName}.ocr`,
      model: "mistral-ocr",
      input: `PDF document (${fileSizeKB}KB)`,
      error: {
        message: error.message,
        stack: error.stack,
      },
      status: "error",
      usageDetails: {
        // Even on error, we should track that we attempted to process
        pages: 0,
      },
    });

    // Flush traces even on error
    await flushTraces();

    // Re-throw
    throw error;
  }
};

/**
 * Specialized tracing function for DeepInfra Whisper transcription
 * @param {object} params - Parameters for the Whisper transcription operation
 * @returns {Promise<object>} Transcription results with trace information
 */
export const tracedWhisperTranscription = async ({
  deepinfraClient, // The DeepInfra client instance
  fileStream, // ReadStream of the audio file
  language,
  functionName,
  userId,
  documentId,
  metadata = {}, // e.g., { fileSizeMB, chunkIndex, totalChunks }
  parentTrace, // The parent Langfuse trace object
}) => {
  const client = langfuseClient || initLangfuse(); // Ensure Langfuse is initialized

  // If Langfuse is not available or no parent trace, perform untraced call
  if (!client || !parentTrace) {
    console.warn(
      "Langfuse client not available or no parentTrace provided. Performing untraced Whisper call."
    );
    const response = await deepinfraClient.audio.transcriptions.create({
      file: fileStream,
      model: "openai/whisper-large-v3-turbo", // Assuming this model, adjust if needed
      response_format: "json", // Assuming json response for text and segments
      language, // Pass language if provided
    });
    return {
      text: response.text,
      segments: response.segments,
      traceId: null,
      generationId: null,
    };
  }

  // Create a Langfuse generation for this transcription attempt
  const generation = parentTrace.generation({
    name: functionName,
    model: metadata.model || "openai/whisper-large-v3-turbo", // Allow model override via metadata
    input: {
      // We don't log the audio stream, just metadata about it
      type: "audio",
      language,
      ...metadata.fileInfo, // e.g., { fileName, fileSizeMB }
    },
    userId, // Add userId to the generation
    metadata: {
      service: "DeepInfra",
      documentId, // Add documentId to the metadata
      ...metadata,
    },
  });

  try {
    // Call DeepInfra API
    const response = await deepinfraClient.audio.transcriptions.create({
      file: fileStream,
      model: metadata.model || "openai/whisper-large-v3-turbo",
      response_format: "json",
      language,
    });

    const outputText = response.text;
    const segmentsCount = response.segments ? response.segments.length : 0;

    // End the generation with success
    generation.end({
      output: {
        textLength: outputText.length,
        segmentsCount,
        preview: outputText.substring(0, 200) + "...", // Log a preview
      },
      usageDetails: metadata.audioDurationSeconds
        ? {
            audioMinutes: parseFloat(
              Math.ceil(metadata.audioDurationSeconds / 60).toFixed(4)
            ),
          }
        : undefined,
      metadata: {
        // Any additional output metadata can go here
      },
    });

    // Return the transcription text and other details
    return {
      text: outputText,
      segments: response.segments,
      traceId: parentTrace.id,
      generationId: generation.id,
    };
  } catch (error) {
    console.error(
      `Error in traced Whisper transcription (${functionName}):`,
      error
    );

    // End the generation with error status
    generation.end({
      level: "ERROR",
      statusMessage: error.message,
      metadata: {
        error: error.message,
        errorType: error.constructor.name,
        stack: error.stack,
        statusCode: error.status || error.statusCode,
      },
    });

    // Re-throw the error to be handled by the caller
    throw error;
  }
};

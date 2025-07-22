/**
 * Process Audio Generation Function
 * This Pub/Sub function is triggered by a message published to the audio-generation-jobs topic.
 * It handles the entire flow of generating audio from SSML content:
 * - Retrieves/generates SSML content
 * - Calls Google Cloud Text-to-Speech API
 * - Monitors long-running operations
 * - Updates Firestore document with results
 */

/* global process */
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { TextToSpeechLongAudioSynthesizeClient } from "@google-cloud/text-to-speech";
import dotenv from "dotenv";
import { Buffer } from "buffer";

// Initialize environment variables
dotenv.config();

// Initialize Text-to-Speech Long Audio client with Application Default Credentials
const longAudioClient = new TextToSpeechLongAudioSynthesizeClient();

// Audio configuration
const defaultAudioConfig = {
  audioEncoding: "LINEAR16",
  effectsProfileId: ["handset-class-device"],
  pitch: 0.1,
  speakingRate: 1.04,
};

// Size limits
const MAX_SSML_BYTES = 900000; // Conservatively set to 900,000 bytes (Google API limit is 1M)
const INFLATION_FACTOR = 2.5; // Conservative estimate - SSML is typically 2-3x larger than source markdown
const MARKDOWN_SIZE_LIMIT = Math.floor(MAX_SSML_BYTES / INFLATION_FACTOR);

// Language to voice mapping
const languageToVoice = {
  en: "en-US-Neural2-F",
  it: "it-IT-Neural2-F",
  // Add more language mappings as needed
};

/**
 * Generates audio from SSML using Google Cloud Long Audio TTS API
 * This handles larger SSML content (up to 1 million bytes)
 *
 * @param {string} ssmlContent - SSML content
 * @param {string} language - Language code (e.g., "it-IT", "en-US", etc.)
 * @param {string} uid - User ID
 * @param {string} docId - Document ID
 * @returns {Promise<Object>} - Object containing the operation name and output path
 */
async function generateAudioFromSsml(ssmlContent, language, uid, docId) {
  try {
    // Check if SSML is extremely large - add a warning
    if (ssmlContent.length > 500000) {
      console.warn(`Very large SSML content detected for document ${docId}:`, {
        docId: docId,
        ssmlLength: ssmlContent.length,
        estimatedDurationMinutes: Math.round(
          (ssmlContent.length / 1000) * 0.75
        ),
      });
    }

    // If language is a two-letter code, convert it into locale format e.g. "it" => "it-IT"
    if (language && language.length === 2) {
      language = `${language}-${language.toUpperCase()}`;
    }

    // Clean SSML string - strip any namespaces or xml:lang attributes that could cause problems
    const cleanedSsml = ssmlContent
      .replace(/xmlns=["'][^"']*["']/g, "")
      .replace(/xml:lang=["'][^"']*["']/g, "")
      .replace(/<speak[^>]*>/g, "<speak>")
      .trim();

    // Select voice based on language
    const languageCode = language.split("-")[0].toLowerCase();
    const voice = {
      languageCode: language,
      name: languageToVoice[languageCode] || languageToVoice.en,
    };

    // Create filename with timestamp for the output audio
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${docId}_audio_${timestamp}.wav`;
    const audioPath = `users/${uid}/docs/${docId}/listening-mode/${fileName}`;

    // Get storage bucket name
    const storage = getStorage();
    const bucket = storage.bucket();
    const bucketName = bucket.name;

    // Create GCS output URI in the format gs://bucket-name/path/to/file
    const outputGcsUri = `gs://${bucketName}/${audioPath}`;

    // Use explicit project ID - don't rely on process.env.GOOGLE_CLOUD_PROJECT which may be undefined in emulator
    // The project ID should match your Google Cloud / Firebase project
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "chiara-tutor";

    // Create Long Audio API request
    const request = {
      parent: `projects/${projectId}/locations/global`,
      input: { ssml: cleanedSsml },
      voice: voice,
      audioConfig: defaultAudioConfig,
      outputGcsUri: outputGcsUri,
    };

    console.log(
      `Sending Long Audio synthesis request for document ${docId} // Output will be stored at: ${outputGcsUri}`
    );

    try {
      // Call Long Audio TTS API (returns long-running operation)
      const [operation] = await longAudioClient.synthesizeLongAudio(request);

      console.log(`Long Audio synthesis operation started:`, {
        operationName: operation.name,
        docId: docId,
        uid: uid,
        ssmlLength: ssmlContent.length,
      });

      // Return operation information and expected output path
      return {
        success: true,
        operationName: operation.name,
        audioPath: audioPath,
        outputGcsUri: outputGcsUri,
      };
    } catch (apiError) {
      // Log the FULL error object for more details
      console.error(`IMMEDIATE Long Audio API error for document ${docId}:`, {
        errorMessage: apiError.message,
        errorCode: apiError.code,
        errorDetails: apiError.details || "No details available",
        fullErrorObject: apiError, // Log the entire error
        docId: docId,
        ssmlLength: ssmlContent.length,
        uid: uid,
      });

      // Check for specific error conditions
      if (apiError.message && apiError.message.includes("exceeds the limit")) {
        console.error(`Content size limit exceeded for document ${docId}`, {
          docId: docId,
          ssmlLength: ssmlContent.length,
        });
        throw new Error(
          `Audio content too long (${ssmlContent.length} characters). The maximum allowed size is approximately 300,000 characters.`
        );
      }

      throw apiError;
    }
  } catch (error) {
    console.error(`Error in generateAudioFromSsml for document ${docId}:`, {
      errorMessage: error.message,
      errorStack: error.stack,
      docId: docId,
      uid: uid,
    });
    throw error;
  }
}

/**
 * Checks the status of a long-running operation
 * @param {string} operationName - Name of the operation to check
 * @returns {Promise<Object>} - Status of the operation
 */
async function checkOperationStatus(operationName) {
  try {
    // Use explicit project ID just like in the main function
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || "chiara-tutor";

    // The operation name might be just the ID or the full path
    // Ensure we have the full path
    let fullOperationName = operationName;
    if (!operationName.includes("projects")) {
      fullOperationName = `projects/${projectId}/locations/global/operations/${operationName}`;
    }

    console.log(`Checking operation status for: ${fullOperationName}`);

    // Get operation by name - pass the operation name directly as a string
    const operation =
      await longAudioClient.checkSynthesizeLongAudioProgress(fullOperationName);

    // Extract data from the operation response
    // The structure might be different than expected, so handle various possible formats
    let done = false;
    let progressPercentage = 0;

    if (operation && operation.done !== undefined) {
      done = operation.done;
    } else if (operation && operation[0] && operation[0].done !== undefined) {
      done = operation[0].done;
    }

    if (
      operation &&
      operation.metadata &&
      operation.metadata.progressPercentage !== undefined
    ) {
      progressPercentage = operation.metadata.progressPercentage;
    } else if (
      operation &&
      operation[0] &&
      operation[0].metadata &&
      operation[0].metadata.progressPercentage !== undefined
    ) {
      progressPercentage = operation[0].metadata.progressPercentage;
    }

    if (done) {
      console.log(
        `Operation status: done=true, progress=${progressPercentage}%`
      );
    } else {
      console.log(
        `Operation status: done=false, progress=${progressPercentage}%`
      );
    }

    return {
      done,
      progressPercentage,
      operation, // Return the raw operation object
    };
  } catch (error) {
    console.error("Error checking operation status:", error);
    throw error;
  }
}

/**
 * Updates document with completed audio information (single or multipart)
 * @param {string} uid - User ID
 * @param {string} docId - Document ID
 * @param {object} audioInfo - Information about the generated audio
 * @param {boolean} audioInfo.isMultipart - Whether the audio is split into chunks
 * @param {number} audioInfo.chunkCount - Total number of chunks (if multipart)
 * @param {string | string[]} audioInfo.paths - Single path (string) or array of paths
 * @returns {Promise<void>}
 */
async function updateDocumentWithAudio(uid, docId, audioInfo) {
  try {
    const db = getFirestore();
    const docRef = db.collection(`users/${uid}/docs`).doc(docId);

    const updateData = {
      listeningMode: {
        status: "completed",
        isMultipart: audioInfo.isMultipart,
        generatedAt: new Date(),
        format: "wav", // Assuming WAV for now
        // Keep existing error/rate limit fields if they exist, otherwise clear them
        error: null,
        isRateLimit: null,
        nextAvailableAt: null,
        errorMessage: null,
      },
    };

    if (audioInfo.isMultipart) {
      updateData.listeningMode.audioPaths = audioInfo.paths; // Array of paths
      updateData.listeningMode.chunkCount = audioInfo.chunkCount;
      // Optionally clear the old single path if migrating
      // updateData.listeningMode.audioPath = null;
    } else {
      updateData.listeningMode.audioPath = audioInfo.paths[0]; // Assign the first (and only) path
      updateData.listeningMode.chunkCount = 1; // Correct
      // updateData.listeningMode.audioPaths = null; // Optional: Clear old array path field
    }

    // Use set with merge: true to preserve other potential fields in listeningMode
    await docRef.set(updateData, { merge: true });

    console.log(
      `Document ${docId} updated with ${audioInfo.isMultipart ? "multipart" : "single"} audio info.`
    );
  } catch (error) {
    console.error("Error updating document with audio info:", {
      docId,
      uid,
      error,
    });
    // Don't rethrow here, as it might be called after successful generation
    // but Firestore update failed.
  }
}

/**
 * Updates document with error status
 * @param {string} uid - User ID
 * @param {string} docId - Document ID
 * @param {string} errorMessage - Error message
 * @returns {Promise<void>}
 */
async function updateDocumentWithError(uid, docId, errorMessage) {
  try {
    const db = getFirestore();
    const docRef = db.collection(`users/${uid}/docs`).doc(docId);

    // Truncate the error message if it's too long
    const maxErrorLength = 200;
    const truncatedErrorMessage =
      errorMessage.length > maxErrorLength
        ? errorMessage.substring(0, maxErrorLength) + "..."
        : errorMessage;

    await docRef.set(
      // Changed from update to set with merge: true for consistency
      {
        listeningMode: {
          status: "error",
          errorMessage: truncatedErrorMessage, // Use the truncated message
          updatedAt: new Date(),
          // Preserve other fields that might exist
        },
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error updating document with error status:", error);
    // Don't rethrow here to prevent recursive errors
  }
}

/**
 * Monitors multiple TTS operations until completion or timeout
 * @param {string[]} operationNames - Array of operation names to monitor
 * @param {string} uid - User ID
 * @param {string} docId - Document ID
 * @param {string} bucketName - Name of the Cloud Storage bucket
 * @param {string} originalPath - The original relative path requested for output
 * @returns {Promise<boolean>} - Whether all operations completed successfully
 */
async function monitorOperations(
  operationNames,
  uid,
  docId,
  bucketName,
  originalPath // Add original path parameter
) {
  const maxAttemptsPerOperation = 100; // Max attempts for *each* operation
  const pollingIntervalMs = 5000; // 5 seconds
  let allSucceeded = true;
  const allGeneratedFilePaths = []; // Store actual RELATIVE paths generated by the API
  const preservedFilePaths = new Set(); // track files copied to safe location

  console.log(
    `Starting monitoring for ${operationNames.length} operations for doc ${docId}.`
  );

  // Update Firestore initially to indicate processing
  try {
    const db = getFirestore();
    const docRef = db.collection(`users/${uid}/docs`).doc(docId);
    await docRef.set(
      {
        listeningMode: {
          status: "processing",
        },
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("Failed to set initial processing status", e);
  }

  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const finalDir = originalPath
    .replace("/listening-mode/", "/listening-mode/final/")
    .replace(/\.wav.*/, "");
  // Ensure finalDir ends with '/'
  const finalDirPrefix = finalDir.endsWith("/") ? finalDir : finalDir + "/";

  for (let i = 0; i < operationNames.length; i++) {
    const operationName = operationNames[i];
    let attempts = 0;
    let operationCompleted = false;
    const startTime = Date.now();

    console.log(
      `Monitoring operation ${i + 1}/${operationNames.length}: ${operationName}`
    );

    while (attempts < maxAttemptsPerOperation && !operationCompleted) {
      try {
        await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
        const status = await checkOperationStatus(operationName);

        if (status.done) {
          console.log(
            `Operation ${i + 1} (${operationName}) completed successfully after ${attempts + 1} attempts.`
          );
          operationCompleted = true;

          // --- Get the final operation result ---
          const operationResult = status.operation; // Get the full operation object
          console.log(
            `Full operation result for ${operationName}:`,
            JSON.stringify(operationResult, null, 2)
          );

          // Check if the completed operation has an error field
          if (operationResult && operationResult.error) {
            console.error(
              `Operation ${i + 1} (${operationName}) completed WITH an ERROR:`,
              JSON.stringify(operationResult.error)
            );

            // Special handling for error code 13 with existing files
            // This handles Google Cloud's internal TTS_BACKEND_REQUEST_RPC_ERROR
            // which often occurs after successfully generating many audio chunks
            if (
              operationResult.error.code === 13 &&
              allGeneratedFilePaths.length > 0
            ) {
              console.log(
                `Despite error code 13, found ${allGeneratedFilePaths.length} audio files. Proceeding with these files.`
              );
              // Do not mark as failed if we have files despite error code 13
              // Continue with the files we've already found
              console.log(
                `Audio file indices found: ${allGeneratedFilePaths
                  .map((p) => p.match(/_(\d+)\.wav$/)?.[1])
                  .filter(Boolean)
                  .join(", ")}`
              );
            } else {
              // For other errors, or if no files found, mark as failed
              allSucceeded = false;
              // Skip file path extraction for this failed operation
              continue; // Go to the next operation
            }
          }

          // --- NEW APPROACH: Directly check for the requested file or list the directory ---
          console.log(
            `Checking if original requested file exists at: ${originalPath}`
          );
          try {
            const [fileExists] = await bucket.file(originalPath).exists();

            if (fileExists) {
              console.log(
                `Found audio file at original requested path: ${originalPath}`
              );
              allGeneratedFilePaths.push(originalPath);
            } else {
              // File not found at exact path, so check the directory containing the requested file
              const directoryPath = originalPath.substring(
                0,
                originalPath.lastIndexOf("/") + 1
              );
              console.log(
                `Original file not found. Listing directory: ${directoryPath}`
              );

              // Get creation timestamp from the originalPath filename (assuming the timestamp format in the filename)
              const timestamp = originalPath.match(
                /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/
              )?.[0];
              const operationStartTime = timestamp
                ? new Date(timestamp.replace(/-/g, ":"))
                : new Date(startTime);

              // List all files in the directory
              const [files] = await bucket.getFiles({ prefix: directoryPath });

              // Filter files: include only .wav files and ensure they were created after operation start
              const audioFiles = [];
              for (const file of files) {
                // Check if it's a .wav file
                if (file.name.endsWith(".wav")) {
                  // Get file metadata to check creation time
                  try {
                    const [metadata] = await file.getMetadata();
                    const fileCreatedTime = new Date(metadata.timeCreated);

                    // Include file if it was created after our operation started
                    if (fileCreatedTime >= operationStartTime) {
                      console.log(
                        `Found potential audio file: ${file.name}, created at: ${fileCreatedTime}`
                      );
                      audioFiles.push(file.name);
                    }
                  } catch (metadataErr) {
                    console.warn(
                      `Could not get metadata for file ${file.name}:`,
                      metadataErr
                    );
                    // Include the file anyway if we can't determine creation time
                    audioFiles.push(file.name);
                  }
                }
              }

              // Log and add the files to the result
              if (audioFiles.length > 0) {
                console.log(
                  `Found ${audioFiles.length} audio file(s) in directory:`,
                  audioFiles
                );
                allGeneratedFilePaths.push(...audioFiles);
              } else {
                console.warn(
                  `No audio files found in directory: ${directoryPath}`
                );
                allSucceeded = false;
              }
            }
          } catch (storageError) {
            console.error(
              `Error checking storage for generated audio files:`,
              storageError
            );
            allSucceeded = false;
          }

          // --- Incremental preservation of newly generated chunks ---
          try {
            const opId = operationName.split("/").pop();
            const prefix = `${originalPath}_${opId}_`;
            const [currentFiles] = await bucket.getFiles({ prefix });
            for (const file of currentFiles) {
              if (!preservedFilePaths.has(file.name)) {
                // Copy to final location
                const destPath = `${finalDirPrefix}${file.name.split("/").pop()}`;
                await file.copy(bucket.file(destPath));
                preservedFilePaths.add(file.name);
                allGeneratedFilePaths.push(destPath);
                console.log(`Preserved chunk: ${file.name} -> ${destPath}`);
              }
            }
          } catch (preserveErr) {
            console.warn(
              `Error during incremental chunk preservation:`,
              preserveErr
            );
          }
        } else {
          attempts++;
          console.log(
            `Operation ${i + 1} in progress: ${status.progressPercentage}% complete (Attempt ${attempts})`
          );
          // Log extended status periodically (e.g., every 10 attempts)
          if (attempts % 10 === 0) {
            console.log(`Extended status for op ${i + 1}:`, {
              operationName,
              progressPercentage: status.progressPercentage,
              elapsedMinutes: Math.round((Date.now() - startTime) / 60000),
              filesFoundSoFar: allGeneratedFilePaths.length,
            });
          }
        }
      } catch (error) {
        console.error(
          `Error monitoring operation ${i + 1} (${operationName}):`,
          error
        );
        // Decide how to handle errors during monitoring. Continue polling or fail fast?
        // For now, we log the error and continue polling up to maxAttempts.
        attempts++;
        if (attempts >= maxAttemptsPerOperation) {
          console.error(
            `Max attempts reached for operation ${i + 1} (${operationName}) after error.`
          );
          allSucceeded = false;
          // Break the inner loop for this failed operation
          break;
        }
      }
    }

    // If an operation timed out (didn't complete within max attempts)
    if (!operationCompleted) {
      console.error(
        `Operation ${i + 1} (${operationName}) timed out after ${maxAttemptsPerOperation} attempts.`
      );
      allSucceeded = false;
      // Optional: Decide if we should stop monitoring subsequent operations if one fails.
      // For now, we continue to monitor others.
    }
  }

  // After monitoring all operations
  if (allSucceeded && allGeneratedFilePaths.length > 0) {
    console.log(
      `All audio generation operations seem complete. Found ${allGeneratedFilePaths.length} total audio files for doc ${docId}.`
    );
    // Update Firestore with all completed paths
    await updateDocumentWithAudio(uid, docId, {
      isMultipart: allGeneratedFilePaths.length > 1, // True if Google split the output
      chunkCount: allGeneratedFilePaths.length, // Use actual file count
      paths: allGeneratedFilePaths, // Use actual generated paths
    });
    return true;
  } else {
    // Modify error message to be clearer when we have files but operation failed
    let errorMessage;
    if (allGeneratedFilePaths.length > 0) {
      errorMessage = `Audio generation operation had errors, but completed ${allGeneratedFilePaths.length} files.`;
      console.error(
        errorMessage + ` (Doc: ${docId}, allSucceeded: ${allSucceeded})`
      );
      // In case we have files but allSucceeded was marked false for some reason other than
      // the special case we handled, still use the files
      await updateDocumentWithAudio(uid, docId, {
        isMultipart: allGeneratedFilePaths.length > 1,
        chunkCount: allGeneratedFilePaths.length,
        paths: allGeneratedFilePaths,
      });
      return true;
    } else {
      errorMessage = `Text may be too large for audio generation.`;
      console.error(
        errorMessage + ` (Doc: ${docId}, allSucceeded: ${allSucceeded})`
      );
      await updateDocumentWithError(uid, docId, errorMessage);
      return false;
    }
  }
}

/**
 * Generates audio for large SSML
 * @param {string} ssmlContent - SSML content
 * @param {string} language - Language code (e.g., "it-IT", "en-US", etc.)
 * @param {string} uid - User ID
 * @param {string} docId - Document ID
 * @returns {Promise<Object>} - Object containing operation names and audio paths
 */
async function generateAudioForLargeSSML(ssmlContent, language, uid, docId) {
  // NOTE: We are now removing manual input chunking. We rely on:
  // 1. The MAX_SSML_BYTES check (900k) before calling this function.
  // 2. The Google Long Audio API's ability to handle large inputs.
  // 3. The monitorOperations function's ability to detect if the API split the *output*.

  // Prepare storage for operations and paths, always use arrays
  const operations = [];
  const audioPaths = [];

  let result; // Declare result outside the try block
  // --- Simplified Logic: Process the entire SSML as one request ---
  console.log(
    `Processing entire SSML for document ${docId} as a single request.`
  );
  try {
    result = await generateAudioFromSsml(ssmlContent, language, uid, docId);
    operations.push(result.operationName);
    // We still need the *expected* base path to help find the actual files later
    audioPaths.push(result.audioPath);
  } catch (error) {
    console.error(`Error processing single large SSML request:`, error);
    throw error; // Re-throw error to be caught by the caller
  }

  // --- Removed Chunking Logic ---

  // Return information about the single operation initiated
  return {
    success: true,
    isInputMultipart: false, // We are not splitting the input anymore
    operationNames: operations, // Always an array (now with one element)
    audioPath: result.audioPath, // Pass the expected output path
    outputGcsUri: result.outputGcsUri, // Pass the original requested URI
    totalChunks: 1, // We initiated only 1 operation
  };
}

/**
 * Main Pub/Sub handler function for audio generation jobs
 */
export const processAudioGeneration = onMessagePublished(
  {
    topic: "audio-generation-jobs",
    timeoutSeconds: 540, // 9 minutes, maximum allowed is 540 seconds
    memory: "1GiB", // Increased memory for TTS processing
  },
  async (event) => {
    try {
      console.log("Received audio generation job:", event.id);

      // Parse message data
      const message = event.data.message;
      const data = message.json;

      if (!data || !data.uid || !data.docId) {
        console.error("Invalid message format, missing required fields:", data);
        return;
      }

      const { uid, docId, language, membershipTier } = data;
      console.log(
        `Processing audio generation for user ${uid}, document ${docId}, Tier: ${membershipTier}`
      );

      // Initialize Firebase services
      const db = getFirestore();
      const storage = getStorage();
      const bucket = storage.bucket();
      const docRef = db.collection(`users/${uid}/docs`).doc(docId);

      try {
        // Get document data
        const docSnapshot = await docRef.get();
        if (!docSnapshot.exists) {
          throw new Error(`Document ${docId} not found`);
        }

        const docData = docSnapshot.data();

        // Get SSML status and path
        const hasSsml =
          docData.tts &&
          docData.tts.status === "completed" &&
          docData.tts.ssmlPath;

        let ssmlPath;
        let ssmlContent;

        // If SSML exists, use it
        if (hasSsml) {
          console.log(
            `SSML already exists for document ${docId}, using existing SSML`
          );
          ssmlPath = docData.tts.ssmlPath;
          const file = bucket.file(ssmlPath);
          const [content] = await file.download();
          ssmlContent = content.toString();
        }
        // Otherwise, need to generate SSML first
        else {
          console.log(
            `SSML does not exist for document ${docId}, generating SSML first`
          );

          // Check if document has completed markdown processing
          if (
            !docData.smartStructure ||
            docData.smartStructure.status !== "completed" ||
            !docData.smartStructure.cleanMarkdownPath
          ) {
            throw new Error(
              "Document needs to complete markdown processing before audio can be generated."
            );
          }

          // Update document status for TTS
          await docRef.set(
            {
              tts: {
                status: "processing",
                startedAt: new Date(),
              },
            },
            { merge: true }
          );

          // Get the clean markdown content from storage
          const cleanMarkdownPath = docData.smartStructure.cleanMarkdownPath;
          const file = bucket.file(cleanMarkdownPath);
          const [cleanMarkdownContent] = await file.download();
          const cleanMarkdownForTTS = cleanMarkdownContent.toString();

          // Add size limit pre-check before SSML generation
          // Check markdown size and estimate if final SSML will exceed limit
          const markdownByteSize = Buffer.byteLength(
            cleanMarkdownForTTS,
            "utf8"
          );

          // Pre-check for estimated size
          if (markdownByteSize > MARKDOWN_SIZE_LIMIT) {
            const estimatedSSMLBytes = Math.round(
              markdownByteSize * INFLATION_FACTOR
            );
            console.error(
              `Markdown content for document ${docId} likely too large for audio conversion:`,
              {
                docId,
                uid,
                markdownBytes: markdownByteSize,
                estimatedSSMLBytes: estimatedSSMLBytes,
                maxSSMLBytes: MAX_SSML_BYTES,
                inflationFactor: INFLATION_FACTOR,
                estimatedAudioMinutes: Math.round(
                  (cleanMarkdownForTTS.length / 1000) * 0.75
                ),
              }
            );

            throw new Error(
              `Document is too large to convert to audio (estimated ${Math.round(estimatedSSMLBytes / 1024)} KB when processed). ` +
                `The maximum supported size is ${MAX_SSML_BYTES / 1000000} MB ` +
                `(which corresponds to roughly ${Math.round((cleanMarkdownForTTS.length / 1000) * 0.75)} minutes of audio).`
            );
          }

          // Import SSML generation function from ssmlGenerator.js
          const { SSMLUtils } = await import("../http/ssmlGenerator.js");

          // Generate SSML
          const documentLanguage = docData.language || language || "en";

          ssmlContent = await SSMLUtils.generateSSML(
            cleanMarkdownForTTS,
            documentLanguage,
            uid, // Pass uid as userId
            docId, // Pass docId
            membershipTier // Pass membershipTier
          );

          // Debug SSML structure to detect issues
          console.log("SSML first 200 chars:", ssmlContent.substring(0, 200));

          // Save SSML to Storage
          const ssmlFileName = `${docId}_tts.ssml`;
          ssmlPath = `users/${uid}/docs/${docId}/tts/${ssmlFileName}`;
          const ssmlRef = bucket.file(ssmlPath);
          await ssmlRef.save(ssmlContent);

          // Update TTS status in Firestore
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

          console.log(`SSML generation completed for document ${docId}`);
        }

        // Add size limit check based on bytes, adhering to Google Cloud TTS API limits (1 million bytes)
        const ssmlByteSize = Buffer.byteLength(ssmlContent, "utf8");

        if (ssmlByteSize > MAX_SSML_BYTES) {
          // Log detailed error information
          console.error(
            `SSML content for document ${docId} exceeds maximum byte size limit:`,
            {
              docId,
              uid,
              contentBytes: ssmlByteSize,
              maxBytes: MAX_SSML_BYTES,
              // Keep estimated minutes based on original character length for user reference
              estimatedAudioMinutes: Math.round(
                (ssmlContent.length / 1000) * 0.75
              ),
            }
          );

          // Throw a user-friendly error referencing KB/MB and estimated duration
          throw new Error(
            `Document is too large to convert to audio (${Math.round(ssmlByteSize / 1024)} KB). ` +
              `The maximum supported size is ${MAX_SSML_BYTES / 1000000} MB ` +
              `(which corresponds to roughly ${Math.round((ssmlContent.length / 1000) * 0.75)} minutes of audio).`
          );
        }

        // Now generate audio from SSML
        console.log(`Generating audio for document ${docId}`);

        // Get language from document or message
        const documentLanguage = docData.language || language || "en-US";

        // Generate audio: This function now handles splitting internally if needed
        // and always returns an object with { isMultipart, operationNames, audioPaths, totalChunks }
        const operationInfo = await generateAudioForLargeSSML(
          ssmlContent,
          documentLanguage,
          uid,
          docId
        );

        // Always monitor the operations (even if only one)
        const success = await monitorOperations(
          operationInfo.operationNames, // Always an array (now just one)
          uid,
          docId,
          bucket.name, // Pass bucket name here
          operationInfo.audioPath // Pass the original requested path
        );

        console.log(
          `Audio generation process for document ${docId} ${success ? "completed successfully" : "failed"}`,
          {
            docId,
            uid,
            success,
            isMultipart: operationInfo.isInputMultipart,
            totalChunks: operationInfo.totalChunks,
            ssmlBytes: ssmlByteSize, // Log byte size instead of length
            operationNames: operationInfo.operationNames,
          }
        );
      } catch (error) {
        console.error(
          `Error processing audio generation job for document ${docId}:`,
          {
            errorMessage: error.message,
            errorStack: error.stack,
            docId,
            uid,
          }
        );

        // Update document with error
        await updateDocumentWithError(
          uid,
          docId,
          `Failed to generate audio: ${error.message}`
        );
      }
    } catch (error) {
      console.error("Error processing Pub/Sub message:", {
        errorMessage: error.message,
        errorStack: error.stack,
        eventId: event.id,
      });
    }
  }
);

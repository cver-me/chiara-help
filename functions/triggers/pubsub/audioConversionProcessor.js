import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import admin from "firebase-admin";
import { Buffer } from "buffer";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import ffprobePath from "@ffprobe-installer/ffprobe";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);

// Add debugging logger
const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  debug: (message, ...args) => {
    console.log(`[DEBUG] ${message}`, ...args);
  },
};

/**
 * Updates the progress document in Firestore
 * @param {string} userId - The user ID
 * @param {Object} progress - The progress object to update
 */
const updateProgress = async (userId, progress) => {
  const db = getFirestore();
  const progressRef = db
    .collection("users")
    .doc(userId)
    .collection("progress")
    .doc("latest");

  await progressRef.set({
    ...progress,
    updatedAt: new Date(),
  });
};

/**
 * Converts an audio file to MP3 format
 * @param {string} inputPath - Path to the input file
 * @param {string} outputPath - Path for the output MP3 file
 * @param {string} userId - User ID for progress updates
 * @returns {Promise<void>}
 */
const convertToMp3 = (inputPath, outputPath, userId) => {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-unused-vars
    let duration = 0;
    let lastProgress = 0;

    ffmpeg(inputPath)
      .toFormat("mp3")
      .on("start", () => {
        logger.debug("Starting conversion to MP3");
      })
      .on("codecData", (data) => {
        duration = parseInt(data.duration.replace(/:/g, ""));
        logger.debug("File duration:", data.duration);
      })
      .on("progress", async (progress) => {
        const percent = Math.round(progress.percent);
        // Only update if progress has changed by at least 5%
        if (percent >= lastProgress + 5) {
          lastProgress = percent;
          await updateProgress(userId, {
            stage: "Converting audio to MP3",
            status: "processing",
            percent: percent,
          });
        }
      })
      .on("end", () => {
        logger.debug("Conversion finished");
        resolve();
      })
      .on("error", (err) => {
        logger.error("Conversion error:", err);
        reject(err);
      })
      .save(outputPath);
  });
};

/**
 * Processes an audio file upload, converting non-MP3 formats to MP3
 * @param {Object} fileData - Object containing file information
 * @returns {Promise<Object>} - Object with information about the processed file
 */
const processAudioFile = async (fileData) => {
  const { filePath, contentType, metadata } = fileData;
  const { userId, docId } = metadata;

  logger.debug("Audio processor - Processing file:", filePath);

  try {
    // Skip if already MP3
    if (contentType === "audio/mpeg") {
      logger.debug("File is already MP3, skipping conversion");
      return {
        success: true,
        skipped: true,
        message: "File is already MP3",
      };
    }

    // Initialize progress tracking
    await updateProgress(userId, {
      stage: "Starting audio conversion",
      status: "initializing",
      percent: 0,
    });

    // Set up temporary file paths
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, "input" + path.extname(filePath));
    const outputPath = path.join(tempDir, "output.mp3");

    // Download the original file
    const bucket = getStorage().bucket();
    await bucket.file(filePath).download({ destination: inputPath });

    // Convert to MP3
    await convertToMp3(inputPath, outputPath, userId);

    // Generate the new MP3 file path - keep it in the same docs directory
    const mp3Path = filePath.replace(/\.[^/.]+$/, ".mp3");

    // Upload the converted MP3 file with original metadata
    await bucket.upload(outputPath, {
      destination: mp3Path,
      metadata: {
        contentType: "audio/mpeg",
        metadata: {
          ...metadata,
          originalFormat: contentType,
          convertedAt: new Date().toISOString(),
        },
      },
    });

    // Clean up temporary files
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    // Get Firestore database reference
    const db = getFirestore();
    const docRef = db
      .collection("users")
      .doc(userId)
      .collection("docs")
      .doc(docId);

    // CRITICAL: Create a version document for the MP3 file BEFORE deleting the original
    // This ensures onFileDelete won't delete the entire folder
    const version = {
      versionNumber: 1,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      storagePath: mp3Path,
      size: (await bucket.file(mp3Path).getMetadata())[0].size,
      author: {
        type: "system",
        id: userId,
      },
    };

    // Add the version document first
    await docRef.collection("versions").doc("1").set(version);
    logger.debug("Created version document for MP3 file");

    // Update Firestore document BEFORE deleting the original file
    await docRef.update({
      status: "completed",
      storagePath: mp3Path,
      contentType: "audio/mpeg",
      convertedAt: new Date().toISOString(),
      updated: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update progress to complete
    await updateProgress(userId, {
      stage: "Audio conversion complete",
      status: "completed",
      percent: 100,
    });

    // Delete the original file AFTER updating Firestore and creating the version
    await bucket.file(filePath).delete();

    logger.debug("Audio conversion completed successfully");

    return {
      success: true,
      message: "Audio conversion completed",
      newStoragePath: mp3Path,
      newContentType: "audio/mpeg",
    };
  } catch (error) {
    logger.error("Error in audio conversion:", error);

    // Update progress with error
    await updateProgress(userId, {
      stage: "Error converting audio",
      status: "error",
      error: error.message,
    });

    // Update the document status to error
    try {
      const db = getFirestore();
      const docRef = db
        .collection("users")
        .doc(metadata.userId)
        .collection("docs")
        .doc(metadata.docId);

      await docRef.update({
        status: "error",
        error: error.message,
        errorAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (updateError) {
      logger.error("Failed to update document status:", updateError);
    }

    // Clean up the original file if it's corrupted
    try {
      await getStorage().bucket().file(filePath).delete();
      logger.debug("Deleted corrupted original file");
    } catch (deleteError) {
      logger.error("Error deleting corrupted file:", deleteError);
    }

    return {
      success: false,
      message: "Error converting audio",
      error: error.message,
    };
  }
};

/**
 * Cloud Function triggered by Pub/Sub messages to process audio files
 */
export const processAudioConversion = onMessagePublished(
  {
    topic: "audio-conversion",
    memory: "2GiB", // Higher memory allocation for audio processing
    timeoutSeconds: 540, // Longer timeout (9 minutes) for larger files
  },
  async (event) => {
    try {
      logger.debug("Audio processor function triggered by Pub/Sub");

      // Extract the fileData from the message
      const message = event.data.message;
      if (!message || !message.data) {
        throw new Error("Invalid message format: no data found");
      }

      // Parse the message data
      const fileData = JSON.parse(
        Buffer.from(message.data, "base64").toString()
      );
      if (!fileData.filePath || !fileData.contentType || !fileData.metadata) {
        throw new Error("Invalid fileData: missing required fields");
      }

      logger.debug("Processing audio file:", fileData.filePath);

      // Process the audio file
      const result = await processAudioFile(fileData);
      logger.debug("Audio processing result:", result);

      return result;
    } catch (error) {
      logger.error("Error in audioConverter function:", error);
      throw error; // Rethrow to trigger Pub/Sub retry
    }
  }
);

/* global process */

import { Buffer } from "buffer";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import admin from "firebase-admin";
import { PubSub } from "@google-cloud/pubsub";
import { ZeroEntropy } from "zeroentropy";
import dotenv from "dotenv";

// Initialize environment variables
dotenv.config();

// Add debugging logger
const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  },
  debug: (/* message, ...args */) => {
    // console.log(`[DEBUG] ${message}`, ...args); // Debug logs removed
  },
};

// Initialize PubSub client
const pubsubClient = new PubSub();

// Supported input formats and their MIME types
export const SUPPORTED_AUDIO_FORMATS = new Set([
  "audio/mpeg", // .mp3
  "audio/mp4", // .m4a
  "audio/x-m4a", // Alternative MIME type for .m4a
  "audio/wav", // .wav
  "audio/x-wav", // Alternative MIME type for .wav
  "audio/ogg", // .ogg
  "audio/x-ms-wma", // .wma
  "audio/aac", // .aac
  "audio/flac", // .flac
]);

/**
 * Configuration for different document types based on path patterns
 */
const DOC_TYPES = {
  UPLOAD: {
    pathPattern: "/docs/",
    collection: "docs",
    docType: "upload",
    authorType: "user",
    requiresSourceDoc: false, // Keep for consistency, though unused now
  },
  // Easy to add new types here, for example:
  // SUMMARY: {
  //   pathPattern: '/summaries/',
  //   collection: 'summaries',
  //   docType: 'summary',
  //   authorType: 'system',
  //   requiresSourceDoc: true
  // }
};

// List of excluded subpaths - files in these paths should be skipped
const EXCLUDED_SUBPATHS = [
  "/temp/",
  "/smartstructure/",
  "/tts/",
  "/listening-mode/",
  "/quiz/",
];

/**
 * Determines if a file path should be processed based on our rules
 * @param {string} filePath - The storage path of the file
 * @returns {{isValid: boolean, docTypeConfig: Object|null}} Object with validation result and docType
 */
const shouldProcessFilePath = (filePath) => {
  // Check if path matches any excluded subpath first
  if (EXCLUDED_SUBPATHS.some((subpath) => filePath.includes(subpath))) {
    return { isValid: false, docTypeConfig: null };
  }

  // Now, specifically check if the path includes the UPLOAD pattern
  const uploadConfig = DOC_TYPES.UPLOAD;
  const pathParts = filePath.split("/");
  const patternPart = uploadConfig.pathPattern.replace(/^\/|\/$/g, "");

  if (pathParts.includes(patternPart)) {
    return { isValid: true, docTypeConfig: uploadConfig };
  }

  // If it's not excluded and not in /docs/, ignore it
  return { isValid: false, docTypeConfig: null };
};

/**
 * Uploads a file to ZeroEntropy for document intelligence and search
 * @param {string} filePath - The storage path of the file
 * @param {Object} metadata - File metadata
 * @param {string} contentType - The file's content type
 * @returns {Promise<Object>} - Result of the ZeroEntropy upload
 */
const uploadToZeroEntropy = async (filePath, metadata, contentType) => {
  try {
    logger.debug("Starting ZeroEntropy upload for:", filePath); // Debug logs removed

    // Initialize ZeroEntropy client with the API key from environment variables
    const zclient = new ZeroEntropy({
      apiKey: process.env.ZEROENTROPY_API_KEY,
    });

    // Download the file from Firebase Storage
    const bucket = admin.storage().bucket();
    const [fileContent] = await bucket.file(filePath).download();

    // Convert to base64 if needed
    const base64Content = fileContent.toString("base64");

    // Create or ensure collection exists
    const collectionName = `${metadata.userId}`;
    try {
      await zclient.collections.add({ collection_name: collectionName });
      logger.debug(
        // Debug logs removed
        `ZeroEntropy collection created/confirmed: ${collectionName}`
      );
    } catch (collectionError) {
      if (!collectionError.message.includes("already exists")) {
        throw collectionError;
      }
    }

    // Get original filename from the storage path
    const originalFilename = filePath.split("/").pop();

    // Create a more intuitive document path with docId/filename
    const documentPath = `${metadata.docId}/${originalFilename}`;

    // Upload the document with modified path and metadata structure
    const uploadResponse = await zclient.documents.add({
      collection_name: collectionName,
      path: documentPath,
      content: {
        type: "auto",
        base64_data: base64Content,
      },
      metadata: {
        userId: metadata.userId,
        courseId: metadata.courseId, // Keep courseId as metadata for filtering
        language: metadata.language,
        docId: metadata.docId,
        contentType: contentType,
        timestamp: new Date().toISOString(),
      },
    });

    logger.debug("ZeroEntropy upload successful:", uploadResponse.message); // Debug logs removed
    return uploadResponse;
  } catch (error) {
    logger.error("Error uploading to ZeroEntropy:", error);
    throw error;
  }
};

// Export the function without secrets configuration
export const onFileUpload = onObjectFinalized(
  {
    memory: "1GiB", // Configure 1GB of memory for this function
  },
  async (object) => {
    logger.debug("onFileUpload triggered with object:", JSON.stringify(object)); // Debug logs removed
    try {
      const filePath = object.data && object.data.name;
      if (!filePath) {
        logger.error("No filePath found in object.data:", object);
        return;
      }
      logger.debug("File path extracted:", filePath); // Debug logs removed

      // Check if we should process this file path
      const { isValid, docTypeConfig } = shouldProcessFilePath(filePath);

      if (!isValid) {
        logger.debug("Skipping processing for file path:", filePath); // Debug logs removed
        return;
      }

      // Extract metadata
      const metadata = object.data.metadata || {};
      logger.debug("File metadata:", metadata); // Debug logs removed

      const { userId, courseId, language, docId } = metadata;
      if (!userId || !courseId || !language || !docId) {
        logger.error("Missing required metadata:", metadata);
        return;
      }

      logger.debug(
        // Debug logs removed
        "Extracted metadata - userId:",
        userId,
        "courseId:",
        courseId,
        "language:",
        language,
        "docId:",
        docId
      );

      // We already have the docTypeConfig from shouldProcessFilePath
      logger.debug("Document type determined:", docTypeConfig.docType); // Debug logs removed

      // Get content type and file name
      const contentType = object.data.contentType || "application/octet-stream";
      const fileName = filePath.split("/").pop();

      // Create the main document with content type for preview purposes
      const docRef = admin
        .firestore()
        .collection("users")
        .doc(userId)
        .collection(docTypeConfig.collection)
        .doc(docId);

      logger.debug(
        // Debug logs removed
        "Document reference set to:",
        `users/${userId}/${docTypeConfig.collection}/${docId}`
      );

      // Prepare document data
      const docData = {
        docType: docTypeConfig.docType,
        currentVersion: 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updated: admin.firestore.FieldValue.serverTimestamp(),
        language,
        courseId,
        fileName,
        contentType,
        storagePath: filePath,
        size: object.data.size,
      };

      // Handle audio files that need conversion
      let isAudioFileForProcessing = false;
      if (
        docTypeConfig.docType === "upload" &&
        SUPPORTED_AUDIO_FORMATS.has(contentType) &&
        contentType !== "audio/mpeg" &&
        filePath.includes("/docs/")
      ) {
        docData.status = "processing";
        docData.originalFormat = contentType;
        isAudioFileForProcessing = true;
      }

      // Check if this is a PDF file for smart structure processing
      let isPdfForSmartStructure = false;
      if (
        docTypeConfig.docType === "upload" &&
        contentType === "application/pdf" &&
        filePath.includes("/docs/")
      ) {
        // Initialize smartStructure field to indicate it's ready for processing
        docData.smartStructure = {
          status: "pending",
          createdAt: new Date(),
        };
        isPdfForSmartStructure = true;
      }

      logger.debug("Attempting to create or update Firestore document..."); // Debug logs removed
      await docRef.set(docData);
      logger.debug("Firestore document successfully written"); // Debug logs removed

      // Create version record with author information
      const version = {
        versionNumber: 1,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        storagePath: filePath,
        size: object.data.size,
        author: {
          type: docTypeConfig.authorType,
          id: userId,
        },
      };

      logger.debug("Attempting to update versions subcollection..."); // Debug logs removed
      await docRef.collection("versions").doc("1").set(version);
      logger.debug("Versions subcollection updated successfully"); // Debug logs removed

      // Process audio file if needed - Use Pub/Sub instead of direct processing
      if (isAudioFileForProcessing) {
        logger.debug("Queuing audio file for processing..."); // Debug logs removed
        const fileData = {
          filePath,
          contentType,
          metadata: object.data.metadata,
        };

        try {
          // Publish message to the audio-conversion topic
          const audioTopic = pubsubClient.topic("audio-conversion");
          await audioTopic.publish(Buffer.from(JSON.stringify(fileData)));

          logger.info(
            // Changed from debug to info
            "Audio file successfully queued for processing:",
            filePath
          );
        } catch (pubsubError) {
          logger.error("Error queuing audio file for processing:", pubsubError);

          // Update document status to reflect error
          try {
            await docRef.set(
              {
                status: "error",
                error: `Failed to queue audio for processing: ${pubsubError.message}`,
                errorAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          } catch (updateError) {
            logger.error(
              "Failed to update document with error status:",
              updateError
            );
          }
        }
      }

      // Process PDF file for smart structure if needed
      if (isPdfForSmartStructure) {
        logger.debug("Queueing PDF for smart structure processing..."); // Debug logs removed
        const fileData = {
          filePath,
          contentType,
          metadata: object.data.metadata,
        };

        try {
          // Initialize Pub/Sub client directly
          const topic = pubsubClient.topic("pdf-processing");

          // Publish message to the queue
          await topic.publish(Buffer.from(JSON.stringify(fileData)));

          logger.info("PDF successfully queued for processing:", filePath); // Changed from debug to info
        } catch (pubsubError) {
          logger.error("Error queuing PDF for processing:", pubsubError);

          // Update document status to reflect error
          try {
            const docRef = admin
              .firestore()
              .collection(`users/${userId}/docs`)
              .doc(docId);

            await docRef.set(
              {
                smartStructure: {
                  status: "error",
                  error: `Failed to queue PDF for processing: ${pubsubError.message}`,
                  processedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
              },
              { merge: true }
            );
          } catch (updateError) {
            logger.error(
              "Failed to update document with error status:",
              updateError
            );
          }
        }
      }

      // Upload to ZeroEntropy if this is a document in the docs folder
      if (docTypeConfig.docType === "upload" && filePath.includes("/docs/")) {
        // Skip audio files
        if (SUPPORTED_AUDIO_FORMATS.has(contentType)) {
          logger.debug("Skipping ZeroEntropy upload for audio file:", filePath); // Debug logs removed
          return;
        }

        logger.debug("Uploading document to ZeroEntropy:", filePath); // Debug logs removed
        try {
          await uploadToZeroEntropy(filePath, metadata, contentType);

          // Update the document with ZeroEntropy information
          await docRef.set(
            {
              zeroEntropy: {
                status: "indexed",
                uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
          logger.info("Document successfully uploaded to ZeroEntropy"); // Changed from debug to info
        } catch (zeError) {
          logger.error("Error uploading to ZeroEntropy:", zeError);

          // Update document with error information
          await docRef.set(
            {
              zeroEntropy: {
                status: "error",
                error: `Failed to upload to ZeroEntropy: ${zeError.message}`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
        }
      }

      logger.info(
        // Changed from debug to info
        "onFileUpload processing completed successfully for file:",
        filePath
      );
    } catch (error) {
      logger.error("Error processing file upload:", error);
    }
  }
);

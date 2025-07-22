/**
 * Audio Generator Function
 * This HTTP callable function handles the frontend of audio generation:
 * - Validates request
 * - Checks rate limits
 * - Checks for existing audio (cache)
 * - Queues a Pub/Sub message for asynchronous processing
 */

/* global process, Buffer */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { PubSub } from "@google-cloud/pubsub";
import dotenv from "dotenv";
import { checkRateLimit } from "../../utils/rateLimits.js";

// Initialize environment variables
dotenv.config();

// Initialize Pub/Sub client
const pubsub = new PubSub();
const TOPIC_NAME = "audio-generation-jobs";

// Custom error class for rate limiting
class RateLimitError extends Error {
  constructor(rateLimitInfo) {
    super(
      `Rate limit exceeded: ${rateLimitInfo.currentCount}/${rateLimitInfo.limitPerDay} requests per day`
    );
    this.name = "RateLimitError";
    this.rateLimitInfo = rateLimitInfo;
  }
}

/**
 * Updates document with rate limit error information
 * @param {string} uid - User ID
 * @param {string} docId - Document ID
 * @param {Object} rateLimitInfo - Rate limit information from error
 * @returns {Promise<void>}
 */
async function updateDocumentWithRateLimitError(uid, docId, rateLimitInfo) {
  try {
    const db = getFirestore();
    const docRef = db.collection(`users/${uid}/docs`).doc(docId);
    const nextAvailableTime = new Date(rateLimitInfo.nextAvailableTimestamp);

    await docRef.update({
      listeningMode: {
        status: "error",
        error: `Rate limit exceeded: ${rateLimitInfo.currentCount}/${rateLimitInfo.limitPerDay} requests per day`,
        isRateLimit: true,
        membershipTier: rateLimitInfo.membershipTier,
        limitPerDay: rateLimitInfo.limitPerDay,
        nextAvailableAt: nextAvailableTime,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error updating document with rate limit:", error);
    // We don't want to throw here, as this would mask the original rate limit error
  }
}

/**
 * Checks rate limits for the audio generator
 * @param {string} uid - User ID
 * @param {FirebaseFirestore.Firestore} db - Firestore database
 * @returns {Promise<Object>} - Rate limit check result or throws an error
 */
async function checkAudioRateLimit(uid, db) {
  try {
    const rateLimitCheck = await checkRateLimit(uid, db, "audioGenerator");

    if (!rateLimitCheck.allowed) {
      throw new RateLimitError(rateLimitCheck);
    }

    // Return the full rate limit check result, including membershipTier
    return rateLimitCheck;
  } catch (error) {
    console.error("Rate limit check failed:", error);

    if (error.name === "RateLimitError") {
      throw error; // Re-throw RateLimitError to be caught in the main function
    }

    throw new HttpsError("internal", "Error checking rate limit", {
      originalError: error.message,
    });
  }
}

/**
 * HTTP Function to handle audio generation requests
 * This function validates requests, checks rate limits, and queues jobs to a Pub/Sub topic
 */
export const generateAudio = onCall(
  { enforceAppCheck: true, cors: true }, // Ensure authentication
  async (request) => {
    let membershipTier;
    try {
      // Get authenticated user
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          "unauthenticated",
          "User must be authenticated to generate audio."
        );
      }

      // Validate request data
      const { docId, checkOperation } = request.data;
      if (!docId) {
        throw new HttpsError(
          "invalid-argument",
          "Document ID is required to generate audio."
        );
      }

      // If this is a status check for an existing operation
      if (checkOperation) {
        console.log(`Checking status for document ${docId} operation`);

        // Get the document to check its status
        const db = getFirestore();
        const docRef = db.collection(`users/${uid}/docs`).doc(docId);
        const docSnapshot = await docRef.get();

        if (!docSnapshot.exists) {
          throw new HttpsError("not-found", "Document not found");
        }

        const docData = docSnapshot.data();

        // If audio generation is completed, return the information
        if (
          docData.listeningMode &&
          docData.listeningMode.status === "completed"
        ) {
          console.log(
            `Audio generation completed for document ${docId}, returning info`
          );

          // Generate signed URL for immediate playback (valid for 1 hour)
          let signedUrl = null;

          // Only attempt to generate signed URL in production
          if (
            !(
              process.env.NODE_ENV === "development" ||
              process.env.FUNCTIONS_EMULATOR === "true"
            )
          ) {
            try {
              const storage = getStorage();
              const bucket = storage.bucket();
              const audioFile = bucket.file(docData.listeningMode.audioPath);

              [signedUrl] = await audioFile.getSignedUrl({
                action: "read",
                expires: Date.now() + 3600000, // 1 hour
              });
            } catch (error) {
              console.warn("Failed to generate signed URL for audio:", error);
            }
          }

          return {
            success: true,
            message: "Audio generation completed",
            status: "completed",
            audioPath: docData.listeningMode.audioPath,
            signedUrl,
            format: docData.listeningMode.format || "wav",
          };
        }

        // If audio generation is still processing, return the status
        if (
          docData.listeningMode &&
          docData.listeningMode.status === "processing"
        ) {
          return {
            success: true,
            message: "Audio generation in progress",
            status: "processing",
          };
        }

        // If audio generation had an error, return the error
        if (docData.listeningMode && docData.listeningMode.status === "error") {
          return {
            success: false,
            message: "Audio generation failed",
            status: "error",
            error: docData.listeningMode.errorMessage || "Unknown error",
          };
        }

        // If no status is found, assume it was never started
        return {
          success: false,
          message: "No active audio generation operation found",
          status: "not_started",
        };
      }

      console.log(`Processing audio request for document ${docId}`);

      // Initialize Firebase services
      const db = getFirestore();
      const storage = getStorage();
      const bucket = storage.bucket();
      const docRef = db.collection(`users/${uid}/docs`).doc(docId);
      const docSnapshot = await docRef.get();

      if (!docSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The requested document does not exist."
        );
      }

      const docData = docSnapshot.data();

      // Check if audio has already been generated
      if (
        docData.listeningMode &&
        docData.listeningMode.status === "completed"
      ) {
        console.log(
          `Audio already exists for document ${docId}, returning existing info`
        );

        // Generate signed URL for immediate playback (valid for 1 hour)
        let signedUrl = null;

        // Only attempt to generate signed URL in production
        if (
          !(
            process.env.NODE_ENV === "development" ||
            process.env.FUNCTIONS_EMULATOR === "true"
          )
        ) {
          try {
            const audioFile = bucket.file(docData.listeningMode.audioPath);

            [signedUrl] = await audioFile.getSignedUrl({
              action: "read",
              expires: Date.now() + 3600000, // 1 hour
            });
          } catch (error) {
            console.warn(
              "Failed to generate signed URL for existing audio:",
              error
            );
          }
        }

        return {
          success: true,
          message: "Audio already exists",
          status: "completed",
          audioPath: docData.listeningMode.audioPath,
          signedUrl: signedUrl,
          format: docData.listeningMode.format || "wav",
          cached: true,
        };
      }

      // Check rate limit for new audio generation
      try {
        // Capture the full result including membershipTier
        const rateLimitResult = await checkAudioRateLimit(uid, db);
        membershipTier = rateLimitResult.membershipTier; // Store the tier
        console.log(`Rate limit check passed for user ${uid}`);
      } catch (error) {
        if (error.name === "RateLimitError") {
          console.warn(`Rate limit exceeded for user ${uid}: ${error.message}`);

          // Update document with rate limit error
          await updateDocumentWithRateLimitError(
            uid,
            docId,
            error.rateLimitInfo
          );

          // Format time for better user experience
          const nextAvailableTime = new Date(
            error.rateLimitInfo.nextAvailableTimestamp
          );
          const formattedTime = nextAvailableTime.toLocaleTimeString();

          return {
            success: false,
            error: `Rate limit exceeded: ${error.rateLimitInfo.currentCount}/${error.rateLimitInfo.limitPerDay} requests per day`,
            isRateLimit: true,
            membershipTier: error.rateLimitInfo.membershipTier,
            nextAvailableAt: nextAvailableTime,
            message: `You can try again after ${formattedTime}`,
          };
        }

        throw error; // Re-throw other errors
      }

      // Update document status to "processing"
      await docRef.update({
        listeningMode: {
          status: "processing",
          startedAt: new Date(),
        },
      });

      // Prepare the Pub/Sub message with all necessary information
      const messageData = {
        uid: uid,
        docId: docId,
        language: docData.language || "en",
        membershipTier: membershipTier, // Add membership tier here
        timestamp: Date.now(),
      };

      // Convert message to buffer for Pub/Sub
      const dataBuffer = Buffer.from(JSON.stringify(messageData));

      try {
        // Publish message to Pub/Sub topic
        const messageId = await pubsub.topic(TOPIC_NAME).publish(dataBuffer);
        console.log(`Message ${messageId} published for audio generation job`);
      } catch (pubsubError) {
        console.error("Error publishing to Pub/Sub:", pubsubError);

        // Update document with error if Pub/Sub fails
        await docRef.update({
          listeningMode: {
            status: "error",
            errorMessage: "Failed to queue audio generation job",
            updatedAt: new Date(),
          },
        });

        throw new HttpsError(
          "internal",
          "Failed to queue audio generation job",
          { originalError: pubsubError.message }
        );
      }

      // Return success immediately, even though processing will happen asynchronously
      return {
        success: true,
        message: "Audio generation job queued successfully",
        status: "processing",
      };
    } catch (error) {
      console.error("Error in generateAudio function:", error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "An unexpected error occurred while generating audio."
      );
    }
  }
);

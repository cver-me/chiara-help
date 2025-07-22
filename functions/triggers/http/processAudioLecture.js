/*
  Process Audio Lecture Function
  This HTTP function is triggered by an HTTPS call and processes an audio file provided by a user.
  It validates the request, checks rate limits, updates the document status to "processing",
  and publishes a message to a Pub/Sub topic for asynchronous processing.
  The actual transcription, enhancement, and storage is handled by a separate Pub/Sub function.
*/

/* global Buffer */
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { PubSub } from "@google-cloud/pubsub";
import { checkRateLimit } from "../../utils/rateLimits.js";

// Initialize Pub/Sub client
const pubsub = new PubSub();
const TOPIC_NAME = "audio-transcription-jobs";

// Special case for rate limit error
const updateDocumentWithRateLimitError = async (
  userId,
  docId,
  rateLimitInfo
) => {
  const db = getFirestore();
  const docRef = db
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  const nextAvailableTime = new Date(rateLimitInfo.nextAvailableTimestamp);

  await docRef.update({
    status: "error",
    error: `Rate limit exceeded: ${rateLimitInfo.currentCount}/${rateLimitInfo.limitPerDay} requests per day. Please try again later.`,
    isRateLimit: true,
    membershipTier: rateLimitInfo.membershipTier,
    limitPerDay: rateLimitInfo.limitPerDay,
    nextAvailableAt: nextAvailableTime,
    updatedAt: new Date(),
  });
};

// Main HTTPS function to queue the audio lecture processing job
export const processAudioLecture = onCall(
  {
    timeoutSeconds: 60, // Reduced timeout since we're just queuing the job
    memory: "256MiB", // Reduced memory since we're just queuing
    enforceAppCheck: true,
    cors: true,
  },
  async (request) => {
    try {
      console.log(
        "DEBUG: Received request data:",
        JSON.stringify(request.data)
      );
      const { userId, docId, courseId } = request.data;

      if (!userId || !docId) {
        console.error("DEBUG: Missing required parameters:", { userId, docId });
        throw new Error("Missing required parameters: userId and docId");
      }

      const firestore = getFirestore();

      // Check rate limit using the centralized function
      try {
        const rateLimitCheck = await checkRateLimit(
          userId,
          firestore,
          "audioLectureProcessor"
        );

        if (!rateLimitCheck.allowed) {
          // Report rate limit exceeded to the user
          console.log(
            `Rate limit exceeded for user ${userId}: ${rateLimitCheck.currentCount}/${rateLimitCheck.limitPerDay}`
          );

          // Update document with rate limit error
          await updateDocumentWithRateLimitError(userId, docId, rateLimitCheck);

          // Format next available time for better user experience
          const nextAvailableTime = new Date(
            rateLimitCheck.nextAvailableTimestamp
          );
          const formattedTime = nextAvailableTime.toLocaleTimeString();

          return {
            success: false,
            error: `Rate limit exceeded: ${rateLimitCheck.currentCount}/${rateLimitCheck.limitPerDay} requests per day`,
            isRateLimit: true,
            membershipTier: rateLimitCheck.membershipTier,
            limitPerDay: rateLimitCheck.limitPerDay,
            currentCount: rateLimitCheck.currentCount,
            nextAvailableAt: nextAvailableTime,
            message: `You can try again after ${formattedTime}`,
          };
        }

        // Log successful rate limit check
        console.log(
          `Rate limit check passed for user ${userId}. Usage: ${rateLimitCheck.currentCount}/${rateLimitCheck.limitPerDay}`
        );
      } catch (error) {
        console.error(`Error checking rate limit for user ${userId}:`, error);
        return {
          success: false,
          error: `Failed to check rate limit: ${error.message}`,
        };
      }

      // Retrieve Firestore document to verify it exists and get metadata
      const docRef = firestore
        .collection("users")
        .doc(userId)
        .collection("docs")
        .doc(docId);
      console.log("DEBUG: Attempting to fetch document at path:", docRef.path);

      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        console.error("DEBUG: Document not found at path:", docRef.path);
        return {
          success: false,
          error: "Document not found",
        };
      }

      const docData = docSnap.data();
      const { storagePath, language } = docData;

      if (!storagePath || !language) {
        console.error("DEBUG: Missing required fields:", {
          storagePath,
          language,
        });
        return {
          success: false,
          error: "Document metadata incomplete",
        };
      }

      // Update document status to "processing"
      await docRef.update({
        smartStructure: {
          status: "processing",
          startedAt: new Date(),
          type: "transcription",
        },
      });

      // Prepare and publish message to Pub/Sub
      const messageData = {
        userId,
        docId,
        courseId,
        storagePath,
        language,
        timestamp: Date.now(),
      };

      const dataBuffer = Buffer.from(JSON.stringify(messageData));

      try {
        const messageId = await pubsub.topic(TOPIC_NAME).publish(dataBuffer);
        console.log(
          `Message ${messageId} published for audio transcription job.`
        );
      } catch (pubsubError) {
        console.error("Error publishing to Pub/Sub:", pubsubError);

        // Update document with error if pub/sub fails
        await docRef.update({
          smartStructure: {
            status: "error",
            error: "Failed to queue transcription job",
            updatedAt: new Date(),
          },
        });

        return {
          success: false,
          error: "Failed to queue transcription job",
        };
      }

      // Return success immediately, even though processing will happen asynchronously
      return {
        success: true,
        courseId: courseId, // Include courseId for navigation purposes
        message: "Transcription job queued successfully",
      };
    } catch (error) {
      console.error("Error queueing audio lecture job:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
);

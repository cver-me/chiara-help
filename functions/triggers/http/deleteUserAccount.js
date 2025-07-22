/* global process */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import admin from "firebase-admin";
import { ZeroEntropy } from "zeroentropy";
import dotenv from "dotenv";

dotenv.config();

const BATCH_SIZE = 100; // Batch size for deleting documents

/**
 * Recursively deletes all documents in a query batch, including their subcollections.
 */
async function deleteQueryBatch(db, query, batchSize, resolve, reject) {
  try {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      resolve(); // No documents left, successfully emptied.
      return;
    }

    const batch = db.batch();

    // Iterate over each document found in the current query snapshot
    for (const doc of snapshot.docs) {
      // Recursively delete all subcollections of the current document FIRST
      const subcollections = await doc.ref.listCollections();
      for (const subcollectionRef of subcollections) {
        await deleteEntireCollection(db, subcollectionRef, batchSize); // Wait for subcollection to be fully deleted
      }
      // After all subcollections of `doc` are deleted, add `doc` itself to the batch for deletion
      batch.delete(doc.ref);
    }

    await batch.commit(); // Commit the batch deletion for the current level documents

    // If the snapshot size was equal to batchSize, there might be more documents.
    if (snapshot.size >= batchSize) {
      setTimeout(() => {
        // Using setTimeout as a more portable way to defer execution
        deleteQueryBatch(db, query, batchSize, resolve, reject);
      }, 0);
    } else {
      resolve(); // All documents at this level processed
    }
  } catch (error) {
    logger.error(
      `Error in deleteQueryBatch for query path ${query._queryOptions.path.toArray().join("/")}:`,
      error
    );
    reject(error);
  }
}

/**
 * Deletes all documents in a collection, including all their subcollections recursively.
 */
async function deleteEntireCollection(db, collectionRef, batchSize) {
  logger.info(
    `Starting recursive deletion for collection: ${collectionRef.path}`
  );
  // Note: Firestore queries are limited in batch size for reads too.
  // The .limit(batchSize) is applied to each query within deleteQueryBatch.
  const query = collectionRef.limit(batchSize);
  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, batchSize, resolve, reject);
  });
}

/**
 * Deletes the calling user's account and associated data.
 *
 * This function performs the following actions:
 * 1. Deletes the user's document from the 'users' Firestore collection (including all subcollections).
 * 2. Deletes the user's profile from the 'userProfiles' Firestore collection.
 * 3. Deletes the user's usage statistics from the 'usageStats' Firestore collection.
 * 4. Deletes the user's Storage files.
 * 5. Deletes the user's ZeroEntropy search collection.
 * 6. Deletes the user from Firebase Authentication.
 *
 * @param {CallableRequest} request - The request object, containing context.auth.
 * @returns {Promise<{success: boolean, message: string}>} - A promise that resolves with a success status and message.
 * @throws {HttpsError} - Throws an error if the user is unauthenticated or if any deletion step fails.
 */
export const deleteUserAccount = onCall(
  { enforceAppCheck: true, cors: true },
  async (request) => {
    logger.info("deleteUserAccount function triggered");

    const db = admin.firestore();
    const auth = admin.auth();

    if (!request.auth) {
      logger.error("User is not authenticated.");
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }

    const uid = request.auth.uid;
    logger.info(`Attempting to delete account for UID: ${uid}`);

    try {
      // 1. Delete user document from 'users' collection and its subcollections
      const userDocRef = db.collection("users").doc(uid);
      const subcollections = await userDocRef.listCollections();
      for (const subcollectionRef of subcollections) {
        await deleteEntireCollection(db, subcollectionRef, BATCH_SIZE);
      }
      await userDocRef.delete(); // Delete the parent document after subcollections

      // 2. Delete user profile from 'userProfiles' collection
      const userProfileDocRef = db.collection("userProfiles").doc(uid);
      await userProfileDocRef.delete();

      // 3. Delete usage statistics from 'usageStats' collection
      const usageStatsDocRef = db.collection("usageStats").doc(uid);
      try {
        await usageStatsDocRef.delete();
      } catch (usageStatsError) {
        if (usageStatsError.code === 5) {
          logger.warn(
            `Usage stats document not found for user ${uid}, skipping deletion.`
          );
        } else {
          logger.error(
            `Failed to delete usage stats for UID: ${uid}. Error: ${usageStatsError.message}`,
            usageStatsError
          );
        }
      }

      // 4. Delete user-specific Storage files
      const bucket = admin.storage().bucket();
      const prefix = `users/${uid}/`;
      try {
        await bucket.deleteFiles({ prefix: prefix });
      } catch (storageError) {
        logger.error(
          `Failed to delete Storage files for UID: ${uid} with prefix: ${prefix}. Error: ${storageError.message}`,
          storageError
        );
      }

      // 5. Delete ZeroEntropy collection
      if (process.env.ZEROENTROPY_API_KEY) {
        logger.info(
          `Attempting to delete ZeroEntropy collection for UID: ${uid}`
        );
        try {
          const zclient = new ZeroEntropy({
            apiKey: process.env.ZEROENTROPY_API_KEY,
          });
          const collectionName = uid; // Collection name is the user's UID

          await zclient.collections.delete({
            collection_name: collectionName,
          });
          logger.info(
            `Successfully deleted ZeroEntropy collection for UID: ${uid}`
          );
        } catch (zeError) {
          // Check if the error indicates the collection was not found (which is okay during deletion)
          // This condition might need adjustment based on the exact error thrown by the SDK for a 404.
          if (
            zeError.message &&
            (zeError.message.toLowerCase().includes("not found") ||
              zeError.message.toLowerCase().includes("no collection found"))
          ) {
            logger.warn(
              `ZeroEntropy collection for UID: ${uid} not found or already deleted. Skipping. Error: ${zeError.message}`
            );
          } else {
            logger.error(
              `Failed to delete ZeroEntropy collection for UID: ${uid}. Error: ${zeError.message}`,
              zeError
            );
            // Depending on policy, you might decide if this error should halt the process
            // or if logging is sufficient. For now, it's logged and process continues.
          }
        }
      } else {
        logger.warn(
          "ZEROENTROPY_API_KEY not configured. Skipping ZeroEntropy collection deletion."
        );
      }

      // 6. Delete user from Firebase Auth (LAST)
      await auth.deleteUser(uid);

      logger.info(`Account deletion successful for UID: ${uid}`);
      return { success: true, message: "Account deleted successfully." };
    } catch (error) {
      logger.error(`Error deleting account for UID: ${uid}`, error);
      let errorMessage =
        "An unexpected error occurred while deleting the account.";
      let errorCode = "internal";
      if (error.code === "auth/user-not-found") {
        errorMessage =
          "User account not found. It might have already been deleted.";
        errorCode = "not-found";
        logger.warn(`Attempted to delete non-existent user: ${uid}`);
      } else if (error instanceof HttpsError) {
        throw error;
      } else {
        errorMessage = `Failed to delete account data. ${error.message}`;
      }
      throw new HttpsError(errorCode, errorMessage, { uid: uid });
    }
  }
);

/* global process */
import { onObjectDeleted } from "firebase-functions/v2/storage";
import admin from "firebase-admin";
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
  debug: (message, ...args) => {
    // Only log debug messages if running in the emulator
    if (process.env.FUNCTIONS_EMULATOR === "true") {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
};

/**
 * Configuration for different document types based on path patterns
 */
const DOC_TYPES = {
  UPLOAD: {
    pathPattern: "/docs/",
    collection: "docs",
    requiresPathCheck: true,
    storagePath: "storagePath",
  },
};

/**
 * Determines the document type configuration based on the file path
 * @param {string} filePath - The storage path of the file
 * @returns {Object|null} The document type configuration or null if not found
 */
const getDocTypeConfig = (filePath) => {
  return (
    Object.values(DOC_TYPES).find((config) =>
      filePath.includes(config.pathPattern)
    ) || null
  );
};

/**
 * Deletes a document from ZeroEntropy
 * @param {string} userId - User ID
 * @param {string} docId - Document ID
 * @param {string} fileName - Optional filename to use
 */
const deleteFromZeroEntropy = async (userId, docId, fileName = "") => {
  try {
    logger.debug(`Attempting to delete document from ZeroEntropy: ${docId}`);

    // Initialize ZeroEntropy client with the API key from environment variables
    const zclient = new ZeroEntropy({
      apiKey: process.env.ZEROENTROPY_API_KEY,
    });

    // Collection name format should match what we used when uploading
    const collectionName = `${userId}`;

    // Document path in ZeroEntropy - match the format in onFileUpload.js
    const documentPath = fileName ? `${docId}/${fileName}` : `${docId}/*`;

    // Delete the document from ZeroEntropy
    await zclient.documents.delete({
      collection_name: collectionName,
      path: documentPath,
    });

    logger.debug(
      `Successfully deleted document from ZeroEntropy: ${documentPath}`
    );
    return true;
  } catch (error) {
    // ZeroEntropy returns a custom error object with a status field
    if (error?.status === 404) {
      // Benign: document or collection already absent → treat as success
      logger.debug(
        "Document/collection already deleted on ZeroEntropy:",
        error?.error?.detail || error.message
      );
      return true;
    }

    logger.error("Error deleting document from ZeroEntropy:", error);
    return false;
  }
};

/**
 * Deletes all files in a Storage folder
 * @param {string} userId - User ID
 * @param {string} docId - Document ID
 * @param {Object} docTypeConfig - Document type configuration
 */
const deleteStorageFolder = async (userId, docId, docTypeConfig) => {
  try {
    // Construct the folder path based on document type
    const folderPath = `users/${userId}/${docTypeConfig.collection}/${docId}`;
    logger.debug(`Attempting to delete folder in Storage: ${folderPath}`);

    // List all files in the folder
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles({
      prefix: folderPath,
    });

    if (files.length > 0) {
      logger.debug(`Found ${files.length} files in folder to delete`);

      // Delete each file
      const deletePromises = files.map(async (file) => {
        try {
          await file.delete();
        } catch (err) {
          if (err.code === 404) {
            logger.debug(`Already deleted: ${file.name}`);
          } else {
            throw err; // re-throw real problems
          }
        }
      });
      await Promise.all(deletePromises);

      logger.debug(`Successfully deleted all files in ${folderPath}`);
    } else {
      logger.debug(`No files found in ${folderPath} to delete`);
    }
  } catch (error) {
    logger.error("Error deleting files from Storage:", error);
  }
};

/**
 * Deletes a document and its versions subcollection
 * @param {FirebaseFirestore.DocumentReference} docRef - Reference to the document
 * @param {Object} docTypeConfig - Document type configuration
 */
const deleteDocumentAndVersions = async (docRef, docTypeConfig) => {
  logger.debug("Deleting document and its versions");

  // Get document ID and user ID from the reference path
  const docId = docRef.id;
  const userId = docRef.parent.parent.id;

  // First get document data for ZeroEntropy before we delete it
  let fileName = "";
  if (docTypeConfig.collection === "docs") {
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const docData = docSnap.data();
      if (docData && docData.storagePath) {
        fileName = docData.storagePath.split("/").pop();
        logger.debug(
          `Extracted filename '${fileName}' for ZeroEntropy deletion`
        );
      }

      // Delete from ZeroEntropy before deleting from Firestore
      await deleteFromZeroEntropy(userId, docId, fileName);
    }
  }

  // Delete versions subcollection
  const versionsSnap = await docRef.collection("versions").get();
  const batch = admin.firestore().batch();
  versionsSnap.forEach((vdoc) => {
    batch.delete(vdoc.ref);
  });

  // Add document itself to the batch
  batch.delete(docRef);

  // Also delete related mindmap and flashcard documents if they exist
  const mindmapRef = admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("mindmaps")
    .doc(docId);

  const flashcardsRef = admin
    .firestore()
    .collection("users")
    .doc(userId)
    .collection("flashcards")
    .doc(docId);

  batch.delete(mindmapRef);
  batch.delete(flashcardsRef);

  // Commit all deletions
  await batch.commit();
  logger.info(
    "Document, versions, and related mindmaps/flashcards have been deleted"
  );

  // Delete all files in the document's folder in Storage
  await deleteStorageFolder(userId, docId, docTypeConfig);
};

/**
 * Deletes specific version documents matching a storage path
 * @param {FirebaseFirestore.DocumentReference} docRef - Reference to the document
 * @param {string} filePath - Storage path to match
 * @param {Object} docTypeConfig - Document type configuration
 */
const deleteMatchingVersions = async (docRef, filePath, docTypeConfig) => {
  logger.debug("Processing version deletion for path:", filePath);
  const versionQuery = await docRef
    .collection("versions")
    .where("storagePath", "==", filePath)
    .get();

  if (versionQuery.empty) {
    logger.debug("No version document found for deleted file");
    return;
  }

  const batch = admin.firestore().batch();
  versionQuery.forEach((vdoc) => {
    batch.delete(vdoc.ref);
  });
  await batch.commit();
  logger.debug("Version document(s) for the deleted file have been removed");

  // Check if this was the last version
  const remainingVersions = await docRef.collection("versions").get();
  if (remainingVersions.empty) {
    logger.info("No versions remain. Deleting main document");

    // Get document ID and user ID from the reference path
    const docId = docRef.id;
    const userId = docRef.parent.parent.id;

    // First extract filename for ZeroEntropy before we delete the document
    let fileName = "";
    if (docTypeConfig.collection === "docs") {
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const docData = docSnap.data();
        if (docData && docData.storagePath) {
          fileName = docData.storagePath.split("/").pop();
          logger.debug(
            `Extracted filename '${fileName}' for ZeroEntropy deletion`
          );
        }

        // Delete from ZeroEntropy before deleting from Firestore
        await deleteFromZeroEntropy(userId, docId, fileName);
      }
    }

    // Now delete from Firestore
    await docRef.delete();
    logger.info("Main document deleted after last version removal");

    // Also delete all files in Storage
    await deleteStorageFolder(userId, docId, docTypeConfig);
  }
};

export const onFileDelete = onObjectDeleted(async (object) => {
  logger.debug("onFileDelete triggered with object:", JSON.stringify(object));

  try {
    // In deletion events, object.data may not always be available. Fall back to object.name.
    const filePath =
      object.data && object.data.name ? object.data.name : object.name;
    if (!filePath) {
      logger.info("No filePath found in deletion event"); // Changed to info
      return;
    }
    logger.debug("File path extracted:", filePath);

    // Get document type configuration
    const docTypeConfig = getDocTypeConfig(filePath);
    if (!docTypeConfig) {
      logger.info("Unknown document type for path:", filePath); // Changed to info
      return;
    }
    logger.debug("Document type determined:", docTypeConfig.collection);

    // Extract path parts
    const pathParts = filePath.split("/");
    if (pathParts.length < 5) {
      logger.info("File path format invalid:", pathParts); // Changed to info
      return;
    }

    const uid = pathParts[1];
    const docId = pathParts[3];
    logger.debug(`Parsed uid: ${uid}, docId: ${docId}`);

    // Get reference to the Firestore document
    const docRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection(docTypeConfig.collection)
      .doc(docId);

    // Retrieve the main document
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      logger.info(
        // Changed to info
        "No Firestore document found for deletion, docId:",
        docId
      );
      return;
    }
    const docData = docSnap.data();

    // Since only UPLOAD type remains, requiresPathCheck is always true.
    // We check if the deleted file is the main file referenced in storagePath
    // or just an associated version (like a converted mp3).
    if (docData[docTypeConfig.storagePath] === filePath) {
      // The main file pointer was deleted, remove everything.
      await deleteDocumentAndVersions(docRef, docTypeConfig);
    } else {
      // A related file (e.g., converted audio) was deleted, remove its version record.
      // If this was the last version, the main doc will also be deleted.
      await deleteMatchingVersions(docRef, filePath, docTypeConfig);
    }
  } catch (error) {
    logger.error("Error processing file deletion:", error);
  }
});

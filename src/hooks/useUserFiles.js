import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { auth, db } from "../utils/firebase";

/**
 * Subscribes to the current user's uploaded documents and generated lecture transcripts.
 * Returns { uploadedDocs, lectureTranscripts } arrays, each item shaped identically
 * to what StudyMaterialPage previously produced.
 */
export default function useUserFiles() {
  const [uploadedDocs, setUploadedDocs] = useState([]);

  // Subscribe to uploads
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const unsub = onSnapshot(
      query(
        collection(db, `users/${user.uid}/docs`),
        orderBy("createdAt", "desc")
      ),
      (snapshot) => {
        try {
          const docs = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              fileName: data.fileName,
              courseId: data.courseId || "uncategorized",
              status: data.status,
              // smart-structure helpers
              isProcessing:
                data.status === "processing" ||
                data.smartStructure?.status === "processing",
              processingType: data.smartStructure?.type || "document",
              createdAt: data.createdAt,
              userId: data.userId,
              language: data.language,
              contentType: data.contentType,
              currentVersion: data.currentVersion || 1,
              size:
                typeof data.size === "string"
                  ? parseInt(data.size, 10)
                  : data.size || 0,
              storagePath: data.storagePath,
              docType: data.docType,
              tts: data.tts,
              listeningMode: data.listeningMode,
              // learning materials
              quiz: data.quiz,
              mindmap: data.mindmap,
              flashcards: data.flashcards,
              smartStructure: data.smartStructure,
            };
          });
          setUploadedDocs(docs);
        } catch (err) {
          console.error("useUserFiles: error processing uploaded docs", err);
        }
      },
      (error) => console.error("useUserFiles: uploads listener error", error)
    );

    return () => unsub();
  }, []);

  return { uploadedDocs };
}

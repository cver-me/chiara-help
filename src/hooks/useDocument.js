import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../utils/firebase";

// Simple in-memory cache for Storage download URLs
const urlCache = new Map();

async function getCachedDownloadUrl(storagePath) {
  if (!storagePath) return null;
  if (urlCache.has(storagePath)) return urlCache.get(storagePath);
  const url = await getDownloadURL(ref(storage, storagePath));
  urlCache.set(storagePath, url);
  return url;
}

/**
 * Custom hook that returns Firestore document data and associated
 * Storage download URLs (original file + smart markdown).
 * Also attaches a real-time listener if the document's smart structure
 * is still processing.
 */
export default function useDocument(docId) {
  const [docData, setDocData] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [markdownUrl, setMarkdownUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribeRealtime = () => {};

    if (!docId || !auth.currentUser) {
      setError("Invalid document ID or user not authenticated");
      setLoading(false);
      return;
    }

    const collectionPath = `users/${auth.currentUser.uid}/docs`;
    const docRef = doc(db, collectionPath, docId);

    async function fetchInitial() {
      try {
        setLoading(true);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          setError("Document not found");
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setDocData(data);

        // Fetch Storage URLs in parallel when possible
        const promises = [];
        if (data.storagePath) {
          promises.push(
            getCachedDownloadUrl(data.storagePath).then((url) => {
              setFileUrl(url);
            })
          );
        }
        if (
          data.smartStructure?.status === "completed" &&
          data.smartStructure?.cleanMarkdownPath
        ) {
          promises.push(
            getCachedDownloadUrl(data.smartStructure.cleanMarkdownPath).then(
              (url) => {
                setMarkdownUrl(url);
              }
            )
          );
        }

        await Promise.all(promises);
        setLoading(false);

        // If smart structure is still processing, attach a listener
        if (data.smartStructure?.status === "processing") {
          unsubscribeRealtime = onSnapshot(docRef, async (snap) => {
            if (!snap.exists()) return;
            const updated = { id: snap.id, ...snap.data() };
            setDocData(updated);

            if (
              updated.smartStructure?.status === "completed" &&
              updated.smartStructure?.cleanMarkdownPath &&
              !markdownUrl
            ) {
              try {
                const mdUrl = await getCachedDownloadUrl(
                  updated.smartStructure.cleanMarkdownPath
                );
                setMarkdownUrl(mdUrl);
              } catch (e) {
                console.error("Failed to fetch markdown URL", e);
              }
            }
          });
        }
      } catch (err) {
        console.error("Error fetching document", err);
        setError("Failed to load document");
        setLoading(false);
      }
    }

    fetchInitial();

    return () => {
      unsubscribeRealtime();
    };
  }, [docId, markdownUrl]);

  return { docData, fileUrl, markdownUrl, loading, error };
}

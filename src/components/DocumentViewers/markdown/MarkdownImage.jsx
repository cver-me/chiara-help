import PropTypes from "prop-types";
import { Image, Loader2, X } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";

/**
 * Simplified image component for markdown rendering that shows placeholders
 * and loads images only when clicked to display in a minimal modal
 */
const MarkdownImage = ({ src, alt, documentId, userId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [loadedImageSrc, setLoadedImageSrc] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [imageUrls, setImageUrls] = useState({});

  // Use a ref to ensure we keep the latest imageUrls between renders
  const imageUrlsRef = useRef(imageUrls);

  // Update ref whenever state changes
  useEffect(() => {
    imageUrlsRef.current = imageUrls;
  }, [imageUrls]);

  // Close modal handler
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    // Don't reset loadedImageSrc or imageUrls when closing
  }, []);

  // Fetch image URLs from Firestore
  const fetchImageUrls = useCallback(async () => {
    // If we already have URLs, use them
    if (imageUrlsRef.current && Object.keys(imageUrlsRef.current).length > 0) {
      console.log(
        "Using cached image URLs:",
        Object.keys(imageUrlsRef.current)
      );
      return imageUrlsRef.current;
    }

    // Skip if no document ID or user ID is provided
    if (!documentId || !userId) {
      return {};
    }

    setIsFetchingUrl(true);

    try {
      const db = getFirestore();
      const docRef = doc(db, "users", userId, "docs", documentId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        // If we have image paths, fetch URLs efficiently
        if (data.smartStructure?.extractedElements?.imagePaths?.length > 0) {
          const storage = getStorage();
          const urlMap = {};

          // Process in parallel for better performance
          await Promise.all(
            data.smartStructure.extractedElements.imagePaths.map(
              async (path) => {
                const fileName = path.split("/").pop();
                try {
                  const storageRef = ref(storage, path);
                  const url = await getDownloadURL(storageRef);
                  urlMap[fileName] = url;
                } catch (error) {
                  console.error(`Error getting URL for ${fileName}:`, error);
                }
              }
            )
          );

          console.log(
            "Fetched image URLs:",
            Object.keys(urlMap).length,
            urlMap
          );
          // Set the state AND update the ref
          setImageUrls(urlMap);
          imageUrlsRef.current = urlMap;
          return urlMap; // Return the URL map directly
        }
      }
      return {};
    } catch (error) {
      console.error("Error fetching image URLs:", error);
      return {};
    } finally {
      setIsFetchingUrl(false);
    }
  }, [documentId, userId]);

  // Get the appropriate image source
  const getImageSource = useCallback(
    (urlsToUse = null) => {
      if (!src) return null;

      // If URL is already http or data URI, use it directly
      if (src.startsWith("http") || src.startsWith("data:")) {
        return src;
      }

      // Use provided URLs or get from ref (more reliable than state)
      const currentUrls = urlsToUse || imageUrlsRef.current || {};

      // Extract filename for lookup
      const fileName = src.split("/").pop();

      // Log for debugging
      console.log(
        "Looking for image:",
        fileName,
        "Available keys:",
        Object.keys(currentUrls)
      );

      // Try to find the image in our URL map
      if (currentUrls && Object.keys(currentUrls).length > 0) {
        // Direct match by filename
        if (currentUrls[fileName]) {
          return currentUrls[fileName];
        }

        // Case-insensitive match
        const lowerFileName = fileName.toLowerCase();
        for (const key in currentUrls) {
          if (key.toLowerCase() === lowerFileName) {
            return currentUrls[key];
          }
        }

        // Partial match
        for (const key in currentUrls) {
          if (key.includes(fileName) || fileName.includes(key)) {
            return currentUrls[key];
          }
        }

        // Try finding by index number if the format is img-X.ext
        if (fileName.match(/img-\d+\.\w+/)) {
          const imgNumber = fileName.match(/img-(\d+)\.\w+/)[1];
          for (const key in currentUrls) {
            if (key.includes(`img-${imgNumber}`)) {
              return currentUrls[key];
            }
          }
        }

        // Last resort - just return the first URL if there is only one
        if (Object.keys(currentUrls).length === 1) {
          return currentUrls[Object.keys(currentUrls)[0]];
        }
      }

      return null;
    },
    [src]
  );

  // Load image when placeholder is clicked
  const handleOpenModal = async () => {
    setLoadError(false);
    setIsModalOpen(true);
    setIsLoading(true);

    let imageSrc = null;

    // Check if we already have URLs in our ref or state
    if (
      (imageUrlsRef.current && Object.keys(imageUrlsRef.current).length > 0) ||
      (imageUrls && Object.keys(imageUrls).length > 0)
    ) {
      // Try ref first (more reliable), then state
      imageSrc = getImageSource(imageUrlsRef.current || imageUrls);
    } else if (documentId && userId) {
      // No URLs yet, fetch them
      const fetchedUrls = await fetchImageUrls();
      imageSrc = getImageSource(fetchedUrls);
    }

    if (imageSrc) {
      setLoadedImageSrc(imageSrc);
    } else {
      console.log("Failed to find image source");
      setLoadError(true);
      setIsLoading(false);
    }
  };

  // Handle image load complete
  const handleImageLoad = () => {
    setIsLoading(false);
  };

  // Handle image load error
  const handleImageError = () => {
    console.log("Image loading failed:", loadedImageSrc);
    setLoadError(true);
    setIsLoading(false);
  };

  // Handle clicks on the modal background (closes the modal)
  const handleBackdropClick = (e) => {
    // Only close if clicking directly on the backdrop, not on its children
    if (e.target === e.currentTarget) {
      handleCloseModal();
    }
  };

  // Extract filename or path for display
  const displayName = src ? src.split("/").pop() : "image";

  // Use effect to prevent body scrolling when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen]);

  // Add keyboard event listener for ESC key
  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === "Escape") {
        handleCloseModal();
      }
    };

    if (isModalOpen) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isModalOpen, handleCloseModal]);

  // Add a timeout to avoid infinite loading state
  useEffect(() => {
    let timeoutId;

    if (isLoading) {
      timeoutId = setTimeout(() => {
        if (isLoading) {
          console.log("Image loading timeout after 10 seconds for", src);
          setLoadError(true);
          setIsLoading(false);
        }
      }, 10000);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoading, src]);

  return (
    <>
      {/* Simple Image Placeholder */}
      <span
        onClick={handleOpenModal}
        className="inline-flex items-center justify-center p-2 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 hover:text-stone-900 transition-colors duration-200 ease-in-out cursor-pointer shadow-sm border border-stone-200"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleOpenModal()}
        title={alt || displayName}
      >
        <Image size={18} strokeWidth={2.5} />
      </span>

      {/* Simplified Modal */}
      {isModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4"
            onClick={handleBackdropClick}
          >
            {/* Close button */}
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 rounded-full p-2 bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-colors"
              aria-label="Close"
            >
              <X size={20} />
            </button>

            {/* Image container */}
            <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
              {/* Loading indicator - shows for both URL fetching and image loading */}
              {(isLoading || isFetchingUrl) && !loadError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <Loader2 size={36} className="animate-spin text-white" />
                    {isFetchingUrl && (
                      <div className="text-white mt-2 text-sm">
                        Fetching image data...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error message */}
              {loadError ? (
                <div className="text-white bg-black bg-opacity-50 rounded p-4">
                  Failed to load image
                </div>
              ) : (
                /* Actual image */
                loadedImageSrc && (
                  <img
                    src={loadedImageSrc}
                    alt={alt || "Image"}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    className="max-w-full max-h-[90vh] object-contain rounded shadow-lg"
                  />
                )
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

// Add prop types validation
MarkdownImage.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  documentId: PropTypes.string,
  userId: PropTypes.string,
};

export default MarkdownImage;

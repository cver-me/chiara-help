import { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import {
  AudioLines,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Loader,
  SkipForward,
  SkipBack,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { getFirestore, doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth } from "../../../utils/firebase";

/**
 * SidebarFooter component with audio generation and playback controls
 * Handles both single and multipart audio playback.
 */
const SidebarFooter = ({ documentId, docData }) => {
  const { t } = useTranslation();
  // State management
  const [status, setStatus] = useState("ready"); // ready, processing, completed, error
  const [errorMessage, setErrorMessage] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [retryTime, setRetryTime] = useState(null);

  // Audio player state
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0); // Duration of the *current* chunk
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Multi-part audio state
  const [isMultipart, setIsMultipart] = useState(false);
  const [audioUrls, setAudioUrls] = useState([]); // Array of download URLs for chunks
  const [totalChunks, setTotalChunks] = useState(0);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [isLoadingUrls, setIsLoadingUrls] = useState(false); // Loading state for URLs

  // --- Initialization and Firestore Listener ---

  // Function to fetch audio URLs (single or multiple)
  const fetchAudioUrls = useCallback(
    async (listeningModeData) => {
      if (!listeningModeData || listeningModeData.status !== "completed")
        return;

      setIsLoadingUrls(true);
      setIsMultipart(listeningModeData.isMultipart || false);
      setTotalChunks(listeningModeData.chunkCount || 1);
      setCurrentChunkIndex(0); // Reset to first chunk
      setAudioUrls([]); // Clear previous URLs

      const storage = getStorage();
      let urls = [];

      try {
        if (listeningModeData.isMultipart && listeningModeData.audioPaths) {
          // Fetch all chunk URLs
          urls = await Promise.all(
            listeningModeData.audioPaths.map((path) => {
              if (!path) return null; // Handle potential null/empty paths
              const fileRef = ref(storage, path);
              return getDownloadURL(fileRef);
            })
          );
          // Filter out any null results from failed fetches
          urls = urls.filter((url) => url !== null);
          console.log(
            `Fetched ${urls.length}/${listeningModeData.audioPaths.length} audio chunk URLs.`
          );
        } else if (
          !listeningModeData.isMultipart &&
          listeningModeData.audioPath
        ) {
          // Fetch single audio URL
          const fileRef = ref(storage, listeningModeData.audioPath);
          const singleUrl = await getDownloadURL(fileRef);
          urls = [singleUrl];
        } else {
          console.warn(
            "Completed status but no audio path(s) found.",
            listeningModeData
          );
          throw new Error(t("sidebarFooter.errors.audioFileNotFound"));
        }

        if (urls.length > 0) {
          setAudioUrls(urls);
          // Automatically set the src for the first chunk
          if (audioRef.current) {
            audioRef.current.src = urls[0];
            // We need to load metadata for the first track
            audioRef.current.load();
          }
        } else {
          throw new Error(t("sidebarFooter.errors.audioFileLoadFailedMany"));
        }
      } catch (error) {
        console.error("Error fetching audio URL(s):", error);
        setErrorMessage(
          error.message || t("sidebarFooter.errors.audioFileLoadFailed")
        );
        setStatus("error");
        setAudioUrls([]);
      } finally {
        setIsLoadingUrls(false);
      }
    },
    [t]
  ); // Added t dependency

  // Check existing audio state from Firestore on initial load
  const checkExistingAudio = useCallback(async () => {
    if (!documentId || !auth.currentUser) return;

    try {
      const db = getFirestore();
      const docRef = doc(db, `users/${auth.currentUser.uid}/docs`, documentId);
      const docSnapshot = await getDoc(docRef);

      if (!docSnapshot.exists()) return;

      const data = docSnapshot.data();
      if (data.listeningMode) {
        setStatus(data.listeningMode.status);
        if (data.listeningMode.status === "completed") {
          await fetchAudioUrls(data.listeningMode);
        } else if (data.listeningMode.status === "error") {
          setErrorMessage(
            data.listeningMode.error ||
              data.listeningMode.errorMessage ||
              t("sidebarFooter.errors.unknownError")
          );
          // Handle rate limit display
          if (
            data.listeningMode.isRateLimit &&
            data.listeningMode.nextAvailableAt?.toDate
          ) {
            startRetryCountdown(data.listeningMode.nextAvailableAt.toDate());
          }
        }
      }
    } catch (error) {
      console.error("Error checking existing audio:", error);
      // Avoid setting global error state here, listener will handle updates
    }
  }, [documentId, fetchAudioUrls, t]); // Added fetchAudioUrls and t dependencies

  // Initialize on mount and set up listener
  useEffect(() => {
    if (documentId) {
      // Initialize with potentially stale docData first
      if (docData?.listeningMode) {
        setStatus(docData.listeningMode.status);
        if (docData.listeningMode.status === "completed") {
          // Fetch URLs based on initial data, might be overwritten by listener
          fetchAudioUrls(docData.listeningMode);
        } else if (docData.listeningMode.status === "error") {
          setErrorMessage(
            docData.listeningMode.error ||
              docData.listeningMode.errorMessage ||
              t("sidebarFooter.errors.unknownError")
          );
          if (
            docData.listeningMode.isRateLimit &&
            docData.listeningMode.nextAvailableAt?.toDate
          ) {
            startRetryCountdown(docData.listeningMode.nextAvailableAt.toDate());
          }
        }
      } else {
        // Check Firestore if no initial data
        checkExistingAudio();
      }

      // Set up real-time listener
      const db = getFirestore();
      const docRef = doc(db, `users/${auth.currentUser.uid}/docs`, documentId);

      const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const updatedDocData = docSnapshot.data();

          if (updatedDocData.listeningMode) {
            const newListeningMode = updatedDocData.listeningMode;
            const currentStatus = status; // Capture current status before update

            setStatus(newListeningMode.status);

            if (newListeningMode.status === "completed") {
              // Fetch URLs only if status *changed* to completed or if URLs are missing
              if (currentStatus !== "completed" || audioUrls.length === 0) {
                fetchAudioUrls(newListeningMode);
              }
            } else if (newListeningMode.status === "error") {
              setErrorMessage(
                newListeningMode.error ||
                  newListeningMode.errorMessage ||
                  t("sidebarFooter.errors.unknownError")
              );
              setIsPlaying(false); // Stop playback on error
              setAudioUrls([]); // Clear URLs on error
              if (
                newListeningMode.isRateLimit &&
                newListeningMode.nextAvailableAt?.toDate
              ) {
                startRetryCountdown(newListeningMode.nextAvailableAt.toDate());
              }
            } else if (newListeningMode.status === "processing") {
              // Clear previous state if processing starts again
              setErrorMessage("");
              setAudioUrls([]);
              setIsPlaying(false);
            }
          }
        }
      });

      // Cleanup listener
      return () => unsubscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, docData, fetchAudioUrls, checkExistingAudio, t]); // Dependencies added

  // Audio element event listeners setup
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Define event handlers inside useEffect to prevent recreating them
    const handleTimeUpdateEvent = () => {
      setCurrentTime(audio.currentTime);
      // Force state update when time changes to ensure UI updates
    };

    const handleDurationChangeEvent = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleLoadedMetadataEvent = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handlePlayEvent = () => {
      setIsPlaying(true);
    };

    const handlePauseEvent = () => {
      setIsPlaying(false);
    };

    const handleEndedEvent = () => {
      console.log(`[ended] Playback ended`);

      // Auto-play next chunk if multipart and not the last chunk
      if (isMultipart && currentChunkIndex < audioUrls.length - 1) {
        console.log(
          `Chunk ${currentChunkIndex + 1} ended, advancing to next chunk`
        );
        setCurrentChunkIndex((prevIndex) => prevIndex + 1);
      } else {
        console.log("Last chunk ended, stopping playback");
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    // Add all event listeners
    audio.addEventListener("timeupdate", handleTimeUpdateEvent);
    audio.addEventListener("durationchange", handleDurationChangeEvent);
    audio.addEventListener("loadedmetadata", handleLoadedMetadataEvent);
    audio.addEventListener("play", handlePlayEvent);
    audio.addEventListener("playing", handlePlayEvent); // Add playing event for more reliability
    audio.addEventListener("pause", handlePauseEvent);
    audio.addEventListener("ended", handleEndedEvent);

    // Clean up all event listeners on unmount
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdateEvent);
      audio.removeEventListener("durationchange", handleDurationChangeEvent);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadataEvent);
      audio.removeEventListener("play", handlePlayEvent);
      audio.removeEventListener("playing", handlePlayEvent);
      audio.removeEventListener("pause", handlePauseEvent);
      audio.removeEventListener("ended", handleEndedEvent);
    };
  }, [audioRef, isMultipart, currentChunkIndex, audioUrls.length, isExpanded]); // Dependencies

  // Effect to change audio source when chunk index changes
  useEffect(() => {
    if (
      isMultipart &&
      audioRef.current &&
      audioUrls.length > currentChunkIndex
    ) {
      const newSrc = audioUrls[currentChunkIndex];
      if (audioRef.current.src !== newSrc) {
        console.log(`Loading chunk ${currentChunkIndex + 1}: ${newSrc}`);
        audioRef.current.src = newSrc;
        audioRef.current.load(); // Important: load the new source

        // Reset duration to prevent old value from displaying
        setDuration(0);

        // Attempt to auto-play the new chunk if the player was playing
        if (isPlaying) {
          // Small delay before trying to play to ensure load has started
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current
                .play()
                .catch((e) =>
                  console.error("Autoplay failed for new chunk:", e)
                );
            }
          }, 100);
        }
      }
    }
    // We only want this effect to run when the index *changes*, or urls/isMultipart changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChunkIndex, audioUrls, isMultipart]);

  // Apply playback rate effect
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioRef]);

  // Change playback rate
  const changePlaybackRate = (rate) => {
    setPlaybackRate(rate);
  };

  // Toggle expanded state
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);

    // When expanding, ensure metadata is loaded if it wasn't already
    if (!isExpanded && audioRef.current) {
      audioRef.current.load();
    }
  };

  // Handle play/pause button click
  const togglePlayback = () => {
    const audio = audioRef.current;
    // Add checks for audio element and src
    if (!audio) {
      console.warn("Audio element not available");
      return;
    }
    if (!audio.src) {
      console.log("Audio source not set, fallback to first chunk");
      // Attempt to load the first track if available
      if (audioUrls.length > 0) {
        audio.src = audioUrls[currentChunkIndex];
        audio.load();
      } else {
        setErrorMessage(t("sidebarFooter.errors.audioFileNotFound"));
        setStatus("error");
        return;
      }
    }

    if (audio.paused || audio.ended) {
      audio.play().catch((e) => {
        console.error("Error playing audio:", e);
        // Provide more specific error feedback if possible
        let playErrorMessage = t("sidebarFooter.errors.playbackFailed");
        if (e.name === "NotAllowedError") {
          playErrorMessage = t("sidebarFooter.errors.autoplayBlocked");
        } else if (e.name === "NotSupportedError") {
          playErrorMessage = t("sidebarFooter.errors.formatNotSupported");
        }
        setErrorMessage(playErrorMessage);
        setStatus("error"); // Consider if error status is appropriate
      });
    } else {
      audio.pause();
    }
    // The event listeners on the audio element will update isPlaying state correctly
  };

  // Skip backward 10 seconds within the current chunk
  const skipBackward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(
        0,
        audioRef.current.currentTime - 10
      );
    }
  };

  // Skip forward 10 seconds within the current chunk
  const skipForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(
        duration, // Use current chunk duration
        audioRef.current.currentTime + 10
      );
    }
  };

  // Skip to the previous chunk
  const skipToPreviousChunk = () => {
    if (isMultipart && currentChunkIndex > 0) {
      setCurrentChunkIndex((prev) => prev - 1);
    }
  };

  // Skip to the next chunk
  const skipToNextChunk = () => {
    if (isMultipart && currentChunkIndex < totalChunks - 1) {
      setCurrentChunkIndex((prev) => prev + 1);
    }
  };

  // Format time in HH:MM:SS when needed, or MM:SS for shorter durations
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    // If hours exist, format as HH:MM:SS
    if (hours > 0) {
      return `${hours}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }

    // Otherwise format as MM:SS
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Handle seeking within the current chunk
  const handleSeek = (e) => {
    if (audioRef.current) {
      const newTime = parseFloat(e.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // --- Generation and Status Checks ---

  // Start countdown timer for rate limit retry
  const startRetryCountdown = (timeToRetry) => {
    if (timeToRetry instanceof Date && !isNaN(timeToRetry)) {
      setRetryTime(timeToRetry);
      // Optional: could implement a visual countdown timer here
    } else {
      console.warn("Invalid date provided for retry countdown:", timeToRetry);
    }
  };

  // Generate audio function call
  const generateAudio = async () => {
    if (!documentId) return;

    // Add confirmation dialog
    if (!window.confirm(t("sidebarFooter.confirmAudioGeneration"))) {
      return; // User cancelled
    }

    try {
      console.log("[Debug] Generating audio request...");
      setStatus("processing");
      setErrorMessage(""); // Clear previous errors
      setRetryTime(null); // Clear retry timer

      const functions = getFunctions();
      const generateAudioFunction = httpsCallable(functions, "generateAudio");
      const result = await generateAudioFunction({
        docId: documentId,
      });

      const responseData = result.data;
      console.log("Generate audio response:", responseData);

      // Backend now handles polling. If success=true and status=processing,
      // the listener will pick up the 'completed' or 'error' state later.
      if (responseData?.success) {
        if (responseData.status === "completed") {
          // This case might happen if audio was generated *very* quickly
          // or was cached and returned immediately by the HTTP function.
          console.log("Audio generation reported completed immediately.");
          setStatus("completed");
          // The HTTP function response for immediate completion needs to match the new schema
          const completedData = {
            status: "completed",
            isMultipart: responseData.isMultipart || false,
            chunkCount: responseData.chunkCount || 1,
            audioPath: responseData.audioPath, // For single
            audioPaths: responseData.audioPaths, // For multi
          };
          await fetchAudioUrls(completedData);
        } else if (responseData.status === "processing") {
          console.log(
            "Audio generation job queued, waiting for listener updates..."
          );
          setStatus("processing"); // Remain in processing state
        } else {
          // Unexpected status from a successful call
          console.warn(
            "Unexpected status in successful generateAudio response:",
            responseData.status
          );
          setStatus("error");
          setErrorMessage(t("sidebarFooter.errors.unknownError"));
        }
      } else if (responseData?.error) {
        console.error(
          "Audio generation failed (reported by function):",
          responseData.error
        );
        setErrorMessage(responseData.error);
        setStatus("error");

        // Handle rate limit error
        if (responseData.isRateLimit && responseData.nextAvailableAt) {
          try {
            const retryDate = new Date(responseData.nextAvailableAt); // Assumes ISO string or similar
            startRetryCountdown(retryDate);
          } catch (dateError) {
            console.error("Error parsing nextAvailableAt date:", dateError);
          }
        }
      }
    } catch (error) {
      console.error("Error calling generateAudio function:", error);
      setErrorMessage(error.message || t("sidebarFooter.errors.unknownError"));
      setStatus("error");
    }
  };

  // --- UI Rendering Logic ---

  // Get collapsed content view
  const getCollapsedContent = () => (
    <div
      className="flex items-center justify-between px-4 py-3 cursor-pointer transition-colors duration-200 ease-in-out hover:bg-stone-50"
      onClick={toggleExpanded}
    >
      <div className="flex items-center">
        <AudioLines className="w-5 h-5 text-stone-600 mr-3" />
        <div>
          <div className="text-sm font-medium text-stone-700">
            {t("sidebarFooter.listen")}
          </div>
          {status === "completed" && (
            <div className="text-xs text-stone-500">
              {isPlaying
                ? `${isMultipart ? `Part ${currentChunkIndex + 1}/${totalChunks} | ` : ""}${formatTime(currentTime)} / ${formatTime(duration)}`
                : t("sidebarFooter.tapToExpand")}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Get expanded content view (player controls)
  const getExpandedContent = () => {
    if (status !== "completed" || isLoadingUrls || audioUrls.length === 0) {
      // Show loader while fetching URLs for completed state
      if (isLoadingUrls) {
        return (
          <div className="p-4 text-center text-sm text-stone-500">
            <Loader size={16} className="inline animate-spin mr-2" />
            {t("sidebarFooter.loadingAudio")}
          </div>
        );
      }
      return null; // Or some placeholder if needed when no URLs but status is completed
    }

    return (
      <div className="px-4 py-3">
        <audio ref={audioRef} preload="metadata" />
        {/* Play/Pause and Skip Chunk buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={skipToPreviousChunk}
            // Disable if not multipart, or it's the first chunk
            disabled={
              !isMultipart || totalChunks <= 1 || currentChunkIndex === 0
            }
            // Hide if not multipart or only one chunk
            className={`w-8 h-8 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ease-in-out ${
              !isMultipart || totalChunks <= 1 ? "invisible" : ""
            }`}
            aria-label={t("sidebarFooter.previousChunk")}
          >
            <SkipBack size={14} />
          </button>
          {/* Play/Pause Button - Always Visible */}
          <button
            className="w-10 h-10 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center hover:bg-stone-300 transition-colors duration-200 ease-in-out"
            onClick={togglePlayback}
            aria-label={
              isPlaying ? t("sidebarFooter.pause") : t("sidebarFooter.play")
            }
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button
            onClick={skipToNextChunk}
            // Disable if not multipart, or it's the last chunk
            disabled={
              !isMultipart ||
              totalChunks <= 1 ||
              currentChunkIndex === totalChunks - 1
            }
            // Hide if not multipart or only one chunk
            className={`w-8 h-8 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 ease-in-out ${
              !isMultipart || totalChunks <= 1 ? "invisible" : ""
            }`}
            aria-label={t("sidebarFooter.nextChunk")}
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* Time display and Part indicator */}
        <div className="flex justify-between items-center text-xs text-stone-500 mb-1">
          <span>{formatTime(currentTime)}</span>
          {/* Show Part indicator only if multipart */}
          {isMultipart && totalChunks > 1 && (
            <span className="font-medium">{`Part ${currentChunkIndex + 1} / ${totalChunks}`}</span>
          )}
          <span>{formatTime(duration)}</span>
        </div>

        {/* Progress bar for current chunk */}
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-2 rounded-full bg-stone-200 appearance-none cursor-pointer mb-3"
          style={{
            backgroundSize: `${duration > 0 ? (currentTime / duration) * 100 : 0}% 100%`,
            backgroundImage: "linear-gradient(to right, #71717a, #71717a)",
            backgroundRepeat: "no-repeat",
          }}
        />

        {/* Skip within chunk and Playback speed controls */}
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            <button
              className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors duration-200 ease-in-out"
              onClick={skipBackward}
              aria-label={t("sidebarFooter.skipBackward")}
            >
              <RotateCcw size={12} />
            </button>
            <button
              className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center hover:bg-stone-200 transition-colors duration-200 ease-in-out"
              onClick={skipForward}
              aria-label={t("sidebarFooter.skipForward")}
            >
              <RotateCw size={12} />
            </button>
          </div>

          <div className="flex items-center space-x-1">
            {[1.0, 1.1, 1.2].map((rate) => (
              <button
                key={rate}
                onClick={() => changePlaybackRate(rate)}
                className={`text-xs px-2 py-0.5 rounded ${
                  playbackRate === rate
                    ? "bg-stone-700 text-white"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                } transition-colors duration-200 ease-in-out`}
              >
                {`${rate}x`}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // --- Main Component Return ---

  // Don't render if no document ID
  if (!documentId) return null;

  // Handle error state
  if (status === "error") {
    const isSizeError =
      errorMessage &&
      (errorMessage.includes("too large") ||
        errorMessage.includes("exceeds maximum byte size") ||
        errorMessage.includes("parts")); // Catch multipart errors too

    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md mt-2 text-red-700 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-sm">
            {t("sidebarFooter.audioGenerationError")}
          </h4>
          <p className="text-xs mt-1">
            {errorMessage || t("sidebarFooter.errors.unknownError")}
          </p>
          {/* Show Try Again button only if not a size error and not rate-limited */}
          {!isSizeError && (!retryTime || new Date() >= retryTime) && (
            <button
              onClick={generateAudio}
              className="mt-2 text-xs font-medium bg-white px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition-colors duration-200 ease-in-out"
            >
              {t("sidebarFooter.tryAgain")}
            </button>
          )}
          {/* Show rate limit message */}
          {retryTime && new Date() < retryTime && (
            <p className="mt-2 text-xs font-medium">
              {t("sidebarFooter.rateLimitMessage")}{" "}
              {retryTime.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Handle processing state
  if (status === "processing") {
    return (
      <div className="p-4 bg-stone-50 border border-stone-200 rounded-md mt-2">
        <div className="flex items-center gap-3">
          <div className="animate-spin text-stone-600">
            <Loader size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-stone-700">
              {t("sidebarFooter.generatingAudio")}
            </div>
            <p className="text-xs text-stone-500">
              {t("sidebarFooter.generatingAudioNote")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle ready state - show generate button
  if (status === "ready") {
    return (
      <div
        onClick={generateAudio}
        className="p-4 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-md mt-2 flex items-center gap-3 cursor-pointer transition-colors duration-200 ease-in-out"
      >
        <AudioLines size={20} className="text-stone-600" />
        <div>
          <div className="text-sm font-medium text-stone-700">
            {t("sidebarFooter.listenToThisDocument")}
          </div>
          <p className="text-xs text-stone-500">
            {t("sidebarFooter.generateAudio")}
          </p>
        </div>
      </div>
    );
  }

  // Handle completed state - show audio player
  if (status === "completed") {
    return (
      <div className="bg-white border border-stone-200 rounded-md mt-2 overflow-hidden">
        {/* Main content - collapsed or expanded */}
        {isExpanded ? (
          <>
            {getExpandedContent()}
            <div
              onClick={toggleExpanded}
              className="border-t border-stone-100 p-2 text-center text-xs text-stone-500 hover:bg-stone-50 cursor-pointer transition-colors duration-200 ease-in-out"
            >
              {t("sidebarFooter.showLess")}
            </div>
          </>
        ) : (
          getCollapsedContent()
        )}
      </div>
    );
  }

  // Default case
  return null;
};

SidebarFooter.propTypes = {
  documentId: PropTypes.string,
  docData: PropTypes.object, // Still useful for initial state
};

export default SidebarFooter;

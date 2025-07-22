import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { X, SquareAsterisk, BookOpenCheck, Network } from "lucide-react";
import ArtifactsList from "./ArtifactsList";
import ArtifactDetail from "./ArtifactDetail";
import LoadingSpinner from "./LoadingSpinner";
import PropTypes from "prop-types";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db, storage, functions } from "../../utils/firebase";
import { ref, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";

// Lazy load modals
const FlashcardModal = lazy(() => import("../FlashcardModal"));
const MindMapModal = lazy(() => import("../MindMapModal"));
const QuizModal = lazy(() => import("../QuizModal"));

const DocumentAssistantPanel = ({
  isOpen,
  onClose,
  selectedText,
  documentId,
  userId,
  onViewChange,
}) => {
  const [artifacts, setArtifacts] = useState([]);
  const [currentArtifactId, setCurrentArtifactId] = useState(null);
  const [view, setView] = useState("list"); // Only 'list' or 'detail' now
  const [documentStatus, setDocumentStatus] = useState({
    flashcards: { status: null },
    mindmap: { status: null },
    quiz: { status: null },
  });
  const [statusLoading, setStatusLoading] = useState(true);
  const [flashcardsData, setFlashcardsData] = useState([]);
  const [flashcardModalOpen, setFlashcardModalOpen] = useState(false);
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [mindmapData, setMindmapData] = useState(null);
  const [mindmapModalOpen, setMindmapModalOpen] = useState(false);
  const [mindmapLoading, setMindmapLoading] = useState(false);
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [generatingMindmap, setGeneratingMindmap] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const { t } = useTranslation();

  // Generate state refs to track generation status without triggering re-renders in listeners
  // This prevents useEffect for Firestore from re-subscribing on every generation state change
  const generatingFlashcardsRef = useMemo(() => ({ current: false }), []);
  const generatingMindmapRef = useMemo(() => ({ current: false }), []);
  const generatingQuizRef = useMemo(() => ({ current: false }), []);

  // Update the ref values when state changes
  useEffect(() => {
    generatingFlashcardsRef.current = generatingFlashcards;
  }, [generatingFlashcards, generatingFlashcardsRef]);

  useEffect(() => {
    generatingMindmapRef.current = generatingMindmap;
  }, [generatingMindmap, generatingMindmapRef]);

  useEffect(() => {
    generatingQuizRef.current = generatingQuiz;
  }, [generatingQuiz, generatingQuizRef]);

  // Call onViewChange when view changes (memoized)
  useEffect(() => {
    if (onViewChange) {
      onViewChange(view);
    }
  }, [view, onViewChange]);

  // Function to fetch flashcards from Firestore (memoized)
  const fetchFlashcards = useCallback(async () => {
    if (!documentId || !userId) return [];

    setFlashcardsLoading(true);
    try {
      // First check if flashcards exist in the flashcards collection
      const flashcardsRef = doc(db, `users/${userId}/flashcards`, documentId);
      const flashcardsSnap = await getDoc(flashcardsRef);

      if (flashcardsSnap.exists()) {
        const data = flashcardsSnap.data();
        if (data.flashcards) {
          setFlashcardsData(data.flashcards);
          return data.flashcards;
        } else if (data.storagePath) {
          // If flashcards are stored in Storage, fetch them
          try {
            const storageRef = ref(storage, data.storagePath);
            const url = await getDownloadURL(storageRef);
            const response = await fetch(url);
            const json = await response.json();
            setFlashcardsData(json.flashcards || []);
            return json.flashcards || [];
          } catch (storageError) {
            console.error(
              "Error fetching flashcards from storage:",
              storageError
            );
            return [];
          }
        }
      }

      return [];
    } catch (error) {
      console.error("Error fetching flashcards:", error);
      return [];
    } finally {
      setFlashcardsLoading(false);
    }
  }, [documentId, userId]);

  // Function to fetch mindmap from Firestore (memoized)
  const fetchMindmap = useCallback(async () => {
    if (!documentId || !userId) return null;

    setMindmapLoading(true);
    try {
      // Check if mindmap exists in the mindmaps collection
      const mindmapRef = doc(db, `users/${userId}/mindmaps`, documentId);
      const mindmapSnap = await getDoc(mindmapRef);

      if (mindmapSnap.exists()) {
        const data = mindmapSnap.data();

        // If we have direct mermaid content
        if (data.mermaid) {
          const mindmap = {
            id: documentId,
            title: data.title || documentStatus.mindmap.title || "Mindmap",
            mermaid: data.mermaid,
          };
          setMindmapData(mindmap);
          return mindmap;
        }
        // If mindmap is stored in Storage
        else if (data.storagePath) {
          try {
            const storageRef = ref(storage, data.storagePath);
            const url = await getDownloadURL(storageRef);
            const response = await fetch(url);
            const json = await response.json();

            // The structure depends on how the mindmap was saved
            const mindmap = {
              id: documentId,
              title: data.title || documentStatus.mindmap.title || "Mindmap",
              mermaid: json.mermaid || "", // Some mindmaps might store mermaid directly
              nodes: json.nodes || [], // Some might store nodes/edges structure
              edges: json.edges || [],
            };

            setMindmapData(mindmap);
            return mindmap;
          } catch (storageError) {
            console.error("Error fetching mindmap from storage:", storageError);
            return null;
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error fetching mindmap:", error);
      return null;
    } finally {
      setMindmapLoading(false);
    }
  }, [documentId, userId, documentStatus.mindmap.title]);

  // Add countdown timer functionality (memoized)
  const startRetryCountdown = useCallback((retryTime) => {
    const updateCountdown = () => {
      const now = new Date();
      const timeRemaining = retryTime - now;

      if (timeRemaining <= 0) {
        // Reset error when time is up
        setGenerationError((prev) => {
          if (prev && prev.includes("Usage limit reached")) {
            return "You can try again now.";
          }
          return prev;
        });
        return;
      }

      // Update error message with remaining time
      const minutes = Math.floor(timeRemaining / 60000);
      const seconds = Math.floor((timeRemaining % 60000) / 1000);

      setGenerationError((prev) => {
        if (prev && prev.includes("Usage limit reached")) {
          return prev.replace(
            /You can try again.*/,
            `You can try again in ${minutes}:${seconds < 10 ? "0" : ""}${seconds}.`
          );
        }
        return prev;
      });

      // Continue countdown
      setTimeout(updateCountdown, 1000);
    };

    // Start the countdown
    updateCountdown();
  }, []);

  // Extracted error handler function to avoid repetition (memoized)
  const handleRateLimitError = useCallback(
    (error, generationType) => {
      let limitInfo = "";
      let retryTime = null;
      let retryMessage = "";

      if (error.details) {
        try {
          const details =
            typeof error.details === "string"
              ? JSON.parse(error.details)
              : error.details;

          if (details.limitPerDay && details.currentCount !== undefined) {
            limitInfo = ` (${details.currentCount}/${details.limitPerDay} requests used today)`;
          }

          // Use the nextAvailableAt information if available
          if (details.nextAvailableAt) {
            retryTime = new Date(details.nextAvailableAt);
            const now = new Date();
            const minutesUntilRetry = Math.ceil((retryTime - now) / 60000);
            retryMessage =
              details.message ||
              ` You can try again in approximately ${minutesUntilRetry} minute${minutesUntilRetry !== 1 ? "s" : ""}.`;
          }

          // If we have membership tier info, suggest upgrading
          if (details.membershipTier === "free") {
            setGenerationError(
              `Usage limit reached${limitInfo}.${retryMessage} You've exceeded the free tier limit. Consider upgrading for higher limits.`
            );

            // Set countdown timer if we have retry time
            if (retryTime) {
              startRetryCountdown(retryTime);
            }
            return true;
          }
        } catch {
          // If we can't parse the details, just use the generic message
        }
      }

      // Default rate limit message
      setGenerationError(
        `Usage limit reached${limitInfo}.${retryMessage} You've exceeded the maximum number of ${generationType} generations per day.`
      );

      // Set countdown timer if we have retry time
      if (retryTime) {
        startRetryCountdown(retryTime);
      }

      return true;
    },
    [startRetryCountdown]
  );

  // Optimized Firestore listener that doesn't recreate on generation states change
  useEffect(() => {
    if (!documentId || !userId) return;

    let unsubscribe = () => {};

    const docRef = doc(db, `users/${userId}/docs`, documentId);

    // Set up real-time listener for document status changes
    unsubscribe = onSnapshot(
      docRef,
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const newStatus = {
            flashcards: data.flashcards || { status: null },
            mindmap: data.mindmap || { status: null },
            quiz: data.quiz || { status: null },
          };

          setDocumentStatus(newStatus);
          setStatusLoading(false);

          // Handle flashcard completion - use ref to check the generating state
          if (
            generatingFlashcardsRef.current &&
            newStatus.flashcards.status === "completed"
          ) {
            setGeneratingFlashcards(false);
            const cards = await fetchFlashcards();
            if (cards && cards.length > 0) {
              setFlashcardModalOpen(true);
            }
          }

          // Handle mindmap completion - use ref to check the generating state
          if (
            generatingMindmapRef.current &&
            newStatus.mindmap.status === "completed"
          ) {
            setGeneratingMindmap(false);
            const mindmap = await fetchMindmap();
            if (mindmap && mindmap.mermaid) {
              setMindmapModalOpen(true);
            }
          }

          // Handle quiz completion - use ref to check the generating state
          if (
            generatingQuizRef.current &&
            newStatus.quiz.status === "completed"
          ) {
            setGeneratingQuiz(false);
            setQuizOpen(true);
          }

          // Handle errors - use refs to check generating states
          if (
            generatingFlashcardsRef.current &&
            newStatus.flashcards.status === "error"
          ) {
            setGeneratingFlashcards(false);
            setGenerationError(
              `Flashcard generation failed: ${newStatus.flashcards.error || "Unknown error"}`
            );
          }

          if (
            generatingMindmapRef.current &&
            newStatus.mindmap.status === "error"
          ) {
            setGeneratingMindmap(false);
            setGenerationError(
              `Mind map generation failed: ${newStatus.mindmap.error || "Unknown error"}`
            );
          }

          if (generatingQuizRef.current && newStatus.quiz.status === "error") {
            setGeneratingQuiz(false);
            setGenerationError(
              `Quiz generation failed: ${newStatus.quiz.error || "Unknown error"}`
            );
          }
        }
      },
      (error) => {
        console.error("Error listening to document status:", error);
        setStatusLoading(false);
      }
    );

    // Clean up listener when component unmounts
    return () => unsubscribe();
  }, [
    documentId,
    userId,
    generatingFlashcardsRef,
    generatingMindmapRef,
    generatingQuizRef,
    fetchFlashcards,
    fetchMindmap,
  ]);

  // Function to generate flashcards (memoized)
  const generateFlashcards = useCallback(async () => {
    if (!documentId || !userId) return;

    setGeneratingFlashcards(true);
    generatingFlashcardsRef.current = true;
    setGenerationError(null);

    try {
      const generateFlashcardsFunction = httpsCallable(
        functions,
        "generateFlashcards"
      );
      const response = await generateFlashcardsFunction({
        docId: documentId,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to generate flashcards");
      }

      // The Firestore listener will handle when generation completes
    } catch (error) {
      console.error("Error generating flashcards:", error);

      // Check specifically for rate limit exceeded error
      if (
        error.code === "functions/resource-exhausted" ||
        (error.message && error.message.includes("Rate limit exceeded"))
      ) {
        if (handleRateLimitError(error, "flashcard")) {
          return;
        }
      } else {
        setGenerationError(error.message || "Failed to generate flashcards");
      }

      setFlashcardsLoading(false);
      setGeneratingFlashcards(false);
      generatingFlashcardsRef.current = false;
    }
  }, [documentId, userId, generatingFlashcardsRef, handleRateLimitError]);

  // Function to generate mindmap (memoized)
  const generateMindmap = useCallback(async () => {
    if (!documentId || !userId) return;

    setGeneratingMindmap(true);
    generatingMindmapRef.current = true;
    setGenerationError(null);

    try {
      const generateMindmapFunction = httpsCallable(
        functions,
        "generateMindmap"
      );
      const response = await generateMindmapFunction({
        docId: documentId,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to generate mindmap");
      }

      // The Firestore listener will handle when generation completes
    } catch (error) {
      console.error("Error generating mindmap:", error);

      // Check specifically for rate limit exceeded error
      if (
        error.code === "functions/resource-exhausted" ||
        (error.message && error.message.includes("Rate limit exceeded"))
      ) {
        if (handleRateLimitError(error, "mind map")) {
          return;
        }
      } else {
        setGenerationError(error.message || "Failed to generate mindmap");
      }

      setMindmapLoading(false);
      setGeneratingMindmap(false);
      generatingMindmapRef.current = false;
    }
  }, [documentId, userId, generatingMindmapRef, handleRateLimitError]);

  // Add the generateQuiz function similar to other generation functions (memoized)
  const generateQuiz = useCallback(async () => {
    if (!documentId || !userId) return;

    setGeneratingQuiz(true);
    generatingQuizRef.current = true;
    setGenerationError(null);

    try {
      const generateQuizFunction = httpsCallable(functions, "generateQuiz");
      const response = await generateQuizFunction({
        docId: documentId,
      });

      if (!response.data.success) {
        throw new Error(response.data.error || "Failed to generate quiz");
      }

      // The Firestore listener will handle when generation completes
    } catch (error) {
      console.error("Error generating quiz:", error);

      // Check specifically for rate limit exceeded error
      if (
        error.code === "functions/resource-exhausted" ||
        (error.message && error.message.includes("Rate limit exceeded"))
      ) {
        if (handleRateLimitError(error, "quiz")) {
          return;
        }
      } else {
        setGenerationError(error.message || "Failed to generate quiz");
      }

      setGeneratingQuiz(false);
      generatingQuizRef.current = false;
    }
  }, [documentId, userId, generatingQuizRef, handleRateLimitError]);

  // Get the current artifact if viewing detail (memoized to prevent unnecessary recalculation)
  const currentArtifact = useMemo(() => {
    return artifacts.find((artifact) => artifact.id === currentArtifactId);
  }, [artifacts, currentArtifactId]);

  // Handler for creating new artifacts (memoized)
  const handleCreateArtifact = useCallback((newArtifact) => {
    setArtifacts((prevArtifacts) => [newArtifact, ...prevArtifacts]);
  }, []);

  // Handler for deleting artifacts (memoized)
  const handleDeleteArtifact = useCallback((artifactId) => {
    setArtifacts((prevArtifacts) =>
      prevArtifacts.filter((artifact) => artifact.id !== artifactId)
    );

    setCurrentArtifactId((currentId) => {
      if (currentId === artifactId) {
        setView("list");
        return null;
      }
      return currentId;
    });
  }, []);

  // Handler for viewing an artifact detail (memoized)
  const handleViewArtifact = useCallback((artifactId) => {
    setCurrentArtifactId(artifactId);
    setView("detail");
  }, []);

  // Handler for going back to the list view (memoized)
  const handleBackToList = useCallback(() => {
    setView("list");
  }, []);

  // Handler for viewing flashcards (memoized)
  const handleViewFlashcards = useCallback(async () => {
    // Reset any previous error
    setGenerationError(null);

    // If flashcards exist, open the modal
    if (documentStatus.flashcards.status === "completed") {
      const cards = await fetchFlashcards();
      if (cards && cards.length > 0) {
        setFlashcardModalOpen(true);
        return;
      }
    }

    // If flashcards are already being generated, show a message
    if (
      documentStatus.flashcards.status === "processing" ||
      generatingFlashcards
    ) {
      return; // We'll show the loading state in the UI
    }

    // If flashcards don't exist yet, generate them
    if (
      !documentStatus.flashcards.status ||
      documentStatus.flashcards.status === "error"
    ) {
      // Confirm generation
      if (window.confirm(t("docAssistant.confirmFlashcards"))) {
        await generateFlashcards();
      }
    }
  }, [
    documentStatus.flashcards.status,
    generateFlashcards,
    fetchFlashcards,
    generatingFlashcards,
    t,
  ]);

  // Handler for closing the flashcard modal (memoized)
  const handleCloseFlashcardModal = useCallback(() => {
    setFlashcardModalOpen(false);
  }, []);

  // Handler for viewing mindmap (memoized)
  const handleViewMindmap = useCallback(async () => {
    // Reset any previous error
    setGenerationError(null);

    // If mindmap exists, open the overlay
    if (documentStatus.mindmap.status === "completed") {
      const mindmap = await fetchMindmap();
      if (mindmap && mindmap.mermaid) {
        setMindmapModalOpen(true);
        return;
      }
    }

    // If mindmap is already being generated, show a message
    if (documentStatus.mindmap.status === "processing" || generatingMindmap) {
      return; // We'll show the loading state in the UI
    }

    // If mindmap doesn't exist yet, generate it
    if (
      !documentStatus.mindmap.status ||
      documentStatus.mindmap.status === "error"
    ) {
      // Confirm generation
      if (window.confirm(t("docAssistant.confirmMindmap"))) {
        await generateMindmap();
      }
    }
  }, [
    documentStatus.mindmap.status,
    fetchMindmap,
    generateMindmap,
    generatingMindmap,
    t,
  ]);

  // Handler for closing the mindmap modal (memoized)
  const handleCloseMindmapModal = useCallback(() => {
    setMindmapModalOpen(false);
  }, []);

  // Update handleOpenQuiz to check status and generate if needed (memoized)
  const handleOpenQuiz = useCallback(async () => {
    // Reset any previous error
    setGenerationError(null);

    // If quiz exists, open it
    if (documentStatus.quiz?.status === "completed") {
      setQuizOpen(true);
      return;
    }

    // If quiz is already being generated, show a message
    if (documentStatus.quiz?.status === "processing" || generatingQuiz) {
      return; // We'll show the loading state in the UI
    }

    // If quiz doesn't exist yet, generate it
    if (
      !documentStatus.quiz?.status ||
      documentStatus.quiz?.status === "error"
    ) {
      // Confirm generation
      if (window.confirm(t("docAssistant.confirmQuiz"))) {
        await generateQuiz();
      }
    }
  }, [documentStatus.quiz?.status, generateQuiz, generatingQuiz, t]);

  // Handler for closing quiz (memoized)
  const handleCloseQuiz = useCallback(() => {
    setQuizOpen(false);
  }, []);

  // Handler for clearing error (memoized)
  const handleClearError = useCallback(() => {
    setGenerationError(null);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Panel container */}
      <div className="h-full w-full flex flex-col rounded-lg">
        <div className="bg-stone-100 p-4 flex justify-between items-center border-b border-stone-200 rounded-t-lg">
          <h2 className="text-lg font-medium text-stone-800">
            {t("docAssistant.title")}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-stone-200 text-stone-500 transition-colors duration-200 ease-in-out"
            aria-label={t("docAssistant.closePanel")}
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col h-full bg-white rounded-b-lg">
          {/* Scrollable content area with special handling for detail view */}
          <div
            className={`flex-1 overflow-y-auto ${view === "detail" ? "p-4" : "p-4 pb-0"}`}
            style={
              view === "detail"
                ? { display: "flex", flexDirection: "column" }
                : {}
            }
          >
            {view === "detail" && currentArtifact ? (
              <div className="h-full flex-1 flex flex-col">
                <ArtifactDetail
                  artifact={currentArtifact}
                  onBack={handleBackToList}
                  onDelete={handleDeleteArtifact}
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* Artifacts Section */}
                <ArtifactsList
                  artifacts={artifacts}
                  onSelectArtifact={handleViewArtifact}
                  onCreateArtifact={handleCreateArtifact}
                  onDeleteArtifact={handleDeleteArtifact}
                  selectedText={selectedText}
                  documentId={documentId}
                  userId={userId}
                />

                {/* General error message if it's not specific to a button */}
                {generationError &&
                  !generationError.includes("flashcard") &&
                  !generationError.includes("mind map") &&
                  !generationError.includes("quiz") && (
                    <div className="mt-4 p-3 border border-red-200 bg-red-50 rounded-md text-red-600 text-sm">
                      <p className="font-medium">
                        {t("docAssistant.errorTitle")}
                      </p>
                      <p>{generationError}</p>
                      <button
                        onClick={handleClearError}
                        className="mt-2 px-2 py-1 text-xs bg-red-100 hover:bg-red-200 rounded text-red-700"
                      >
                        {t("docAssistant.dismiss")}
                      </button>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Fixed "Study tools" section at the bottom */}
          {view !== "detail" && (
            <div className="border-t border-stone-200 p-3 bg-white mt-auto sticky bottom-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-stone-700">
                  {t("docAssistant.studyTools")}
                </h3>
                {generationError &&
                  !generationError.includes("flashcard") &&
                  !generationError.includes("mind map") &&
                  !generationError.includes("quiz") && (
                    <button
                      onClick={handleClearError}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      {t("docAssistant.clearError")}
                    </button>
                  )}
              </div>

              {/* Horizontal button layout */}
              <div className="flex space-x-2">
                {/* Mind Map button */}
                <div
                  className={`flex-1 flex flex-col items-center p-2 border border-stone-200 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors duration-200 ease-in-out ${mindmapLoading || generatingMindmap ? "opacity-80" : ""}`}
                  onClick={
                    !mindmapLoading && !generatingMindmap
                      ? handleViewMindmap
                      : undefined
                  }
                  title={t("docAssistant.mindMap")}
                  aria-label={t("docAssistant.mindMap")}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                      documentStatus.mindmap?.status === "completed"
                        ? "bg-purple-100"
                        : "bg-stone-100"
                    }`}
                  >
                    {statusLoading ||
                    generatingMindmap ||
                    documentStatus.mindmap?.status === "processing" ? (
                      <LoadingSpinner />
                    ) : (
                      <Network
                        size={16}
                        className={
                          documentStatus.mindmap?.status === "completed"
                            ? "text-purple-600"
                            : "text-stone-500"
                        }
                      />
                    )}
                  </div>
                  <span className="text-xs font-medium text-center text-stone-700">
                    {t("docAssistant.mindMap")}
                  </span>
                  {generationError && generationError.includes("mind map") && (
                    <span className="text-xxs text-red-500 mt-1">
                      {t("docAssistant.error")}
                    </span>
                  )}
                </div>

                {/* Quiz button */}
                <div
                  className={`flex-1 flex flex-col items-center p-2 border border-stone-200 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors duration-200 ease-in-out ${generatingQuiz ? "opacity-80" : ""}`}
                  onClick={!generatingQuiz ? handleOpenQuiz : undefined}
                  title={t("docAssistant.quiz")}
                  aria-label={t("docAssistant.quiz")}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                      documentStatus.quiz?.status === "completed"
                        ? "bg-amber-100"
                        : "bg-stone-100"
                    }`}
                  >
                    {statusLoading ||
                    generatingQuiz ||
                    documentStatus.quiz?.status === "processing" ? (
                      <LoadingSpinner />
                    ) : (
                      <BookOpenCheck
                        size={16}
                        className={
                          documentStatus.quiz?.status === "completed"
                            ? "text-amber-600"
                            : "text-stone-500"
                        }
                      />
                    )}
                  </div>
                  <span className="text-xs font-medium text-center text-stone-700">
                    {t("docAssistant.quiz")}
                  </span>
                  {generationError && generationError.includes("quiz") && (
                    <span className="text-xxs text-red-500 mt-1">
                      {t("docAssistant.error")}
                    </span>
                  )}
                </div>

                {/* Flashcards button */}
                <div
                  className={`flex-1 flex flex-col items-center p-2 border border-stone-200 rounded-lg cursor-pointer hover:bg-stone-50 transition-colors duration-200 ease-in-out ${flashcardsLoading || generatingFlashcards ? "opacity-80" : ""}`}
                  onClick={
                    !flashcardsLoading && !generatingFlashcards
                      ? handleViewFlashcards
                      : undefined
                  }
                  title={t("docAssistant.flashcards")}
                  aria-label={t("docAssistant.flashcards")}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                      documentStatus.flashcards?.status === "completed"
                        ? "bg-teal-100"
                        : "bg-stone-100"
                    }`}
                  >
                    {statusLoading ||
                    generatingFlashcards ||
                    documentStatus.flashcards?.status === "processing" ? (
                      <LoadingSpinner />
                    ) : (
                      <SquareAsterisk
                        size={16}
                        className={
                          documentStatus.flashcards?.status === "completed"
                            ? "text-teal-600"
                            : "text-stone-500"
                        }
                      />
                    )}
                  </div>
                  <span className="text-xs font-medium text-center text-stone-700">
                    {t("docAssistant.flashcards")}
                  </span>
                  {generationError && generationError.includes("flashcard") && (
                    <span className="text-xxs text-red-500 mt-1">
                      {t("docAssistant.error")}
                    </span>
                  )}
                </div>
              </div>

              {/* Status text row - appears only when needed */}
              {(generatingFlashcards ||
                generatingMindmap ||
                generatingQuiz ||
                documentStatus.flashcards?.status === "processing" ||
                documentStatus.mindmap?.status === "processing" ||
                documentStatus.quiz?.status === "processing") && (
                <div className="mt-2 text-xs text-center text-stone-500">
                  {generatingFlashcards ||
                  documentStatus.flashcards?.status === "processing"
                    ? t("docAssistant.generatingFlashcards")
                    : generatingMindmap ||
                        documentStatus.mindmap?.status === "processing"
                      ? t("docAssistant.generatingMindMap")
                      : generatingQuiz ||
                          documentStatus.quiz?.status === "processing"
                        ? t("docAssistant.generatingQuiz")
                        : ""}
                </div>
              )}

              {/* Specific error details - if any */}
              {generationError &&
                (generationError.includes("flashcard") ||
                  generationError.includes("mind map") ||
                  generationError.includes("quiz")) && (
                  <div className="mt-2 p-2 border border-red-200 bg-red-50 rounded-md text-red-600 text-xs">
                    {generationError}
                    <button
                      onClick={handleClearError}
                      className="ml-2 underline text-xs"
                    >
                      {t("docAssistant.dismiss")}
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Use React Portal to render modals outside of the panel's DOM hierarchy */}
      {createPortal(
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
              Loading...
            </div>
          }
        >
          {/* Mind Map Modal */}
          {mindmapModalOpen && (
            <MindMapModal
              isOpen={mindmapModalOpen}
              onClose={handleCloseMindmapModal}
              mindMap={mindmapData}
            />
          )}

          {/* Flashcard Modal */}
          {flashcardModalOpen && (
            <FlashcardModal
              isOpen={flashcardModalOpen}
              onClose={handleCloseFlashcardModal}
              flashcards={flashcardsData}
              sourceFiles={[documentId]} // Just pass the document ID as a source file for now
            />
          )}

          {/* Quiz Modal */}
          {quizOpen && (
            <QuizModal
              isOpen={quizOpen}
              onClose={handleCloseQuiz}
              docId={documentId}
            />
          )}
        </Suspense>,
        document.body
      )}
    </>
  );
};

// PropTypes validation
DocumentAssistantPanel.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  selectedText: PropTypes.string,
  documentId: PropTypes.string.isRequired,
  userId: PropTypes.string,
  onViewChange: PropTypes.func,
};

export default DocumentAssistantPanel;

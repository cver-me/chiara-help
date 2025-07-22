import { useState, useEffect } from "react";
import { ScrollText, BookOpen, Loader } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import {
  generateSummary,
  generateExplanation,
  fetchDocumentContent,
} from "../../services/documentAssistant";
import { db } from "../../utils/firebase";
import { doc, getDoc } from "firebase/firestore";

const ArtifactGenerationControls = ({
  selectedText,
  documentId,
  userId, // Kept for future use
  onCreateArtifact,
  // eslint-disable-next-line no-unused-vars
  isCreating, // Kept for component state synchronization
  setIsCreating,
  setProcessingMode,
}) => {
  const { t } = useTranslation();
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setInternalProcessingMode] = useState(null);
  const [documentLanguage, setDocumentLanguage] = useState("en");

  // Fetch document language when component mounts
  useEffect(() => {
    const fetchDocumentLanguage = async () => {
      if (!documentId || !userId) return;

      try {
        // Try to fetch document metadata from different collections
        const collections = ["docs", "lecture_transcripts"];

        for (const collection of collections) {
          const docRef = doc(db, `users/${userId}/${collection}`, documentId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            // Check if language is available in document data
            if (data.language) {
              setDocumentLanguage(data.language);
              break;
            }
          }
        }
      } catch (err) {
        console.error("Error fetching document language:", err);
        // Default to English if there's an error
        setDocumentLanguage("en");
      }
    };

    fetchDocumentLanguage();
  }, [documentId, userId]);

  // Mode available for document
  const documentModes = [
    {
      id: "summary",
      name: t("artifactDetail.type.summary"),
      icon: <ScrollText size={16} />,
      description: selectedText
        ? t("artifactGenerationControls.summarizeSelectedText")
        : t("artifactGenerationControls.summarizeDocument"),
    },
  ];

  // Modes available when text is selected
  const textModes = [
    {
      id: "explain",
      name: t("artifactDetail.type.explain"),
      icon: <BookOpen size={16} />,
      description: t("artifactGenerationControls.explainSelectedText"),
      disabled: !selectedText,
    },
  ];

  // Available modes based on whether text is selected
  const availableModes = selectedText
    ? [...documentModes, ...textModes]
    : [...documentModes, ...textModes]; // Always show both, but disable explain when no selection

  // Handle generating the artifact
  const handleGenerate = async (mode) => {
    // Guard clauses
    if (isProcessing) return;
    if (mode === "explain" && !selectedText) {
      setError(t("artifactGenerationControls.selectTextError"));
      return;
    }

    setInternalProcessingMode(mode);
    if (setProcessingMode) {
      setProcessingMode(mode);
    }
    setIsProcessing(true);
    setError(null);

    if (setIsCreating) {
      setIsCreating(true);
    }

    try {
      let result;
      let documentContent;

      // For summary mode, determine what to summarize
      if (mode === "summary" && !selectedText) {
        // If no text is selected, fetch entire document
        try {
          documentContent = await fetchDocumentContent(documentId, userId);
        } catch (contentError) {
          console.error("Error fetching document content:", contentError);
          setError("Failed to retrieve document content. Please try again.");
          if (setIsCreating) {
            setIsCreating(false);
          }
          setIsProcessing(false);
          setInternalProcessingMode(null);
          if (setProcessingMode) {
            setProcessingMode(null);
          }
          return;
        }
      }

      if (mode === "summary") {
        const textToSummarize = selectedText || documentContent;
        const isEntireDocument = !selectedText;

        result = await generateSummary(
          textToSummarize,
          documentId,
          documentLanguage,
          userId,
          isEntireDocument
        );
      } else if (mode === "explain") {
        result = await generateExplanation(
          selectedText,
          documentId,
          documentLanguage,
          userId
        );
      }

      // Create the new artifact
      const newArtifact = {
        id: uuidv4(),
        type: mode,
        content: result.content,
        timestamp: Date.now(),
        sourceText:
          mode === "explain" || (mode === "summary" && selectedText)
            ? selectedText
            : null,
        documentId,
        language: documentLanguage,
      };

      onCreateArtifact(newArtifact);
    } catch (err) {
      console.error("Error generating artifact:", err);

      // Check specifically for rate limit exceeded error
      if (
        err.code === "functions/resource-exhausted" ||
        (err.message && err.message.includes("Rate limit exceeded"))
      ) {
        // Extract rate limit information if available in the error details
        let limitInfo = "";
        if (err.details) {
          try {
            const details =
              typeof err.details === "string"
                ? JSON.parse(err.details)
                : err.details;
            if (details.limitPerDay && details.currentCount !== undefined) {
              limitInfo = ` (${details.currentCount}/${details.limitPerDay} requests used today)`;
            }

            // If we have membership tier info, suggest upgrading
            if (details.membershipTier === "free") {
              setError(
                t("createModal.rateLimit.freeTierExceeded", { limitInfo })
              );
              return;
            }
          } catch {
            // If we can't parse the details, just use the generic message
          }
        }
        // Default rate limit message
        setError(t("createModal.rateLimit.genericExceeded", { limitInfo }));
      } else {
        setError(t("artifactGenerationControls.generateFailed"));
      }

      if (setIsCreating) {
        setIsCreating(false);
      }
      if (setProcessingMode) {
        setProcessingMode(null);
      }
    } finally {
      setIsProcessing(false);
      setInternalProcessingMode(null);
    }
  };

  return (
    <div className="mb-4">
      <h3 className="font-medium text-stone-700 text-sm mb-2">
        {t("artifactGenerationControls.generateNew")}
      </h3>

      {selectedText && (
        <div className="mb-2.5 p-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs rounded-lg flex items-center">
          <ScrollText
            size={12}
            className="mr-1.5 text-blue-500 flex-shrink-0"
          />
          <span className="font-medium">
            {t("artifactGenerationControls.selectedText")}:{" "}
            {selectedText.length} {t("artifactGenerationControls.chars")}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        {availableModes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => handleGenerate(mode.id)}
            disabled={isProcessing || mode.disabled}
            className={`w-full text-left transition-all px-2.5 py-2 rounded-md ${
              mode.disabled
                ? "bg-stone-50 cursor-not-allowed"
                : isProcessing && processingMode === mode.id
                  ? "bg-stone-100"
                  : "bg-white hover:bg-stone-50"
            } ${
              isProcessing && processingMode === mode.id
                ? "border border-stone-300"
                : mode.disabled
                  ? "border border-stone-200"
                  : "border border-stone-300 hover:border-stone-400"
            }`}
          >
            <div className="flex items-center">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap">
                  <h4
                    className={`text-sm font-medium ${mode.disabled ? "text-stone-400" : "text-stone-800"} mr-1.5`}
                  >
                    {mode.name}
                  </h4>

                  {mode.id === "summary" && (
                    <span
                      className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        selectedText
                          ? "bg-blue-100 text-blue-700"
                          : "bg-stone-100 text-stone-700"
                      }`}
                    >
                      {selectedText
                        ? t("artifactsList.fromTextSelection")
                        : t("artifactsList.fromDocument")}
                    </span>
                  )}

                  {mode.id === "explain" && !selectedText && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                      {t("artifactGenerationControls.requiresTextSelection")}
                    </span>
                  )}

                  {mode.id === "explain" && selectedText && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {t("artifactsList.fromTextSelection")}
                    </span>
                  )}
                </div>

                <p
                  className={`text-xs mt-0.5 truncate ${mode.disabled ? "text-stone-400" : "text-stone-500"}`}
                >
                  {mode.description}
                </p>
              </div>

              {isProcessing && processingMode === mode.id && (
                <div className="ml-2 flex-shrink-0">
                  <Loader size={16} className="text-stone-500 animate-spin" />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// PropTypes validation
ArtifactGenerationControls.propTypes = {
  selectedText: PropTypes.string,
  documentId: PropTypes.string.isRequired,
  userId: PropTypes.string,
  onCreateArtifact: PropTypes.func.isRequired,
  isCreating: PropTypes.bool,
  setIsCreating: PropTypes.func,
  setProcessingMode: PropTypes.func,
};

export default ArtifactGenerationControls;

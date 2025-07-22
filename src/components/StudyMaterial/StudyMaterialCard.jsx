import { useState, lazy, Suspense, useCallback } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Download,
  Trash2,
  FileAudio,
  FileText,
  Book,
  File,
  MoreVertical,
  Pencil,
  Loader2,
  Wand2,
  Network,
  BookOpenCheck,
  SquareAsterisk,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../utils/firebase";

// Lazy load modals
const FlashcardModal = lazy(() => import("../FlashcardModal"));
const MindMapModal = lazy(() => import("../MindMapModal"));
const QuizModal = lazy(() => import("../QuizModal"));

// Helper function that returns an appropriate icon based on contentType
const getIcon = (contentType) => {
  if (!contentType) return <File className="w-5 h-5 text-gray-500" />;

  if (contentType.startsWith("audio/")) {
    return <FileAudio className="w-5 h-5 text-gray-500" />;
  }

  switch (contentType) {
    case "application/pdf":
      return <FileText className="w-5 h-5 text-gray-500" />;
    case "text/markdown":
      return <Book className="w-5 h-5 text-gray-500" />;
    default:
      return <File className="w-5 h-5 text-gray-500" />;
  }
};

const StudyMaterialCard = ({
  file,
  onView,
  onRename,
  onDelete,
  onDownload,
  onOpenCreateModal,
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(file.title || file.fileName);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // We only create these states when actually needed, based on user interaction
  const [activeModal, setActiveModal] = useState(null); // 'quiz', 'mindmap', 'flashcards'
  const [isLoading, setIsLoading] = useState(false);
  const [modalData, setModalData] = useState(null);

  // Check if the file has any completed learning materials
  const hasMaterials =
    (file.quiz && file.quiz.status === "completed") ||
    (file.mindmap && file.mindmap.status === "completed") ||
    (file.flashcards && file.flashcards.status === "completed");

  const handleTitleSubmit = () => {
    if (newTitle.trim() && newTitle.trim() !== file.title) {
      onRename(file.id, newTitle.trim());
    }
    setIsEditing(false);
  };

  // Fetch flashcards data - only called when user clicks the flashcard badge
  const fetchFlashcards = useCallback(async () => {
    if (!file.id || !file.userId) return;

    setIsLoading(true);
    try {
      // Check if flashcards exist in the flashcards collection
      const flashcardsRef = doc(db, `users/${file.userId}/flashcards`, file.id);
      const flashcardsSnap = await getDoc(flashcardsRef);

      if (flashcardsSnap.exists()) {
        const data = flashcardsSnap.data();
        if (data.flashcards) {
          setModalData(data.flashcards);
          setActiveModal("flashcards");
          return;
        } else if (data.storagePath) {
          // If flashcards are stored in Storage, fetch them
          try {
            const storageRef = ref(storage, data.storagePath);
            const url = await getDownloadURL(storageRef);
            const response = await fetch(url);
            const json = await response.json();
            setModalData(json.flashcards || []);
            setActiveModal("flashcards");
            return;
          } catch (storageError) {
            console.error(
              "Error fetching flashcards from storage:",
              storageError
            );
            setIsLoading(false);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching flashcards:", error);
    } finally {
      setIsLoading(false);
    }
  }, [file.id, file.userId]);

  // Fetch mindmap data - only called when user clicks the mindmap badge
  const fetchMindmap = useCallback(async () => {
    if (!file.id || !file.userId) return;

    setIsLoading(true);
    try {
      // Check if mindmap exists
      const mindmapRef = doc(db, `users/${file.userId}/mindmaps`, file.id);
      const mindmapSnap = await getDoc(mindmapRef);

      if (mindmapSnap.exists()) {
        const data = mindmapSnap.data();

        // If direct mermaid content
        if (data.mermaid) {
          const mindmap = {
            id: file.id,
            title:
              data.title ||
              file.mindmap?.title ||
              t("studyMaterialCard.mindmapDefaultTitle"),
            mermaid: data.mermaid,
          };
          setModalData(mindmap);
          setActiveModal("mindmap");
          return;
        }
        // If stored in Storage
        else if (data.storagePath) {
          try {
            const storageRef = ref(storage, data.storagePath);
            const url = await getDownloadURL(storageRef);
            const response = await fetch(url);
            const json = await response.json();

            const mindmap = {
              id: file.id,
              title:
                data.title ||
                file.mindmap?.title ||
                t("studyMaterialCard.mindmapDefaultTitle"),
              mermaid: json.mermaid || "",
              nodes: json.nodes || [],
              edges: json.edges || [],
            };

            setModalData(mindmap);
            setActiveModal("mindmap");
            return;
          } catch (storageError) {
            console.error("Error fetching mindmap from storage:", storageError);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching mindmap:", error);
    } finally {
      setIsLoading(false);
    }
  }, [file.id, file.userId, file.mindmap?.title, t]);

  // Event handlers for learning materials - reuses the same modal state
  const handleOpenQuiz = useCallback(
    (e) => {
      e.stopPropagation(); // Prevent triggering parent onClick
      if (file.quiz && file.quiz.status === "completed") {
        setActiveModal("quiz");
      }
    },
    [file.quiz]
  );

  const handleOpenMindMap = useCallback(
    async (e) => {
      e.stopPropagation(); // Prevent triggering parent onClick
      if (file.mindmap && file.mindmap.status === "completed") {
        await fetchMindmap();
      }
    },
    [file.mindmap, fetchMindmap]
  );

  const handleOpenFlashcards = useCallback(
    async (e) => {
      e.stopPropagation(); // Prevent triggering parent onClick
      if (file.flashcards && file.flashcards.status === "completed") {
        await fetchFlashcards();
      }
    },
    [file.flashcards, fetchFlashcards]
  );

  // Single handler to close any modal
  const handleCloseModal = useCallback(() => {
    setActiveModal(null);
    setModalData(null);
  }, []);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 relative">
      <div className="flex items-center justify-between">
        <div
          className={`flex items-center space-x-2 ${
            file.status === "processing" ||
            file.smartStructure?.status === "processing" ||
            file.isProcessing
              ? "cursor-not-allowed opacity-60"
              : isEditing
                ? "cursor-text"
                : "cursor-pointer"
          }`}
          onClick={() => {
            if (
              !isEditing &&
              file.status !== "processing" &&
              !(file.smartStructure?.status === "processing") &&
              !file.isProcessing
            ) {
              // Check if smartStructure exists and is completed, go directly to document page
              if (
                file.smartStructure &&
                file.smartStructure.status === "completed"
              ) {
                navigate(`/document/${file.id}`);
              } else {
                // Otherwise use the regular preview
                onView(file);
              }
            }
          }}
        >
          {file.status === "processing" ||
          file.smartStructure?.status === "processing" ||
          file.isProcessing ? (
            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
          ) : (
            getIcon(file.contentType)
          )}
          {isEditing ? (
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleTitleSubmit();
                }
              }}
              className="border border-gray-300 rounded p-1 text-sm"
              autoFocus
            />
          ) : (
            <span className="font-medium text-gray-900 break-all">
              {file.title || file.fileName}
              {file.status === "processing" && (
                <span className="ml-2 text-xs text-gray-500">
                  Processing...
                </span>
              )}
              {/* Show transcription specific status */}
              {file.smartStructure?.status === "processing" &&
                file.smartStructure?.type === "transcription" && (
                  <span className="ml-2 text-xs text-gray-500">
                    {t("studyMaterialCard.status.transcribing")}
                  </span>
                )}
              {/* Show general smartStructure processing */}
              {file.smartStructure?.status === "processing" &&
                file.smartStructure?.type !== "transcription" && (
                  <span className="ml-2 text-xs text-gray-500">
                    {t("studyMaterialCard.status.processing")}
                  </span>
                )}
              {/* Use the isProcessing flag if available */}
              {file.isProcessing &&
                !(file.status === "processing") &&
                !(file.smartStructure?.status === "processing") && (
                  <span className="ml-2 text-xs text-gray-500">
                    {file.processingType === "transcription"
                      ? t("studyMaterialCard.status.transcribing")
                      : t("studyMaterialCard.status.processing")}
                  </span>
                )}
              {file.version > 1 && (
                <span className="ml-2 text-xs text-gray-500">
                  v{file.version}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            disabled={
              file.status === "processing" ||
              file.smartStructure?.status === "processing" ||
              file.isProcessing
            }
            className={`p-1 rounded ${
              file.status === "processing" ||
              file.smartStructure?.status === "processing" ||
              file.isProcessing
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-gray-100"
            }`}
            title={t("studyMaterialCard.actions.more")}
          >
            <MoreVertical className="w-5 h-5 text-gray-500" />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded shadow-lg z-10">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  setIsEditing(true);
                }}
                disabled={
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                }
                className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 ${
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                    ? "opacity-50 cursor-not-allowed bg-gray-50"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Pencil className="w-4 h-4" />
                <span>{t("studyMaterialCard.actions.rename")}</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenCreateModal(file);
                }}
                disabled={
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                }
                className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 ${
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                    ? "opacity-50 cursor-not-allowed bg-gray-50"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Wand2 className="w-4 h-4" />
                <span>{t("studyMaterialCard.actions.createFrom")}</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onDownload();
                }}
                disabled={
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                }
                className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 ${
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                    ? "opacity-50 cursor-not-allowed bg-gray-50"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <Download className="w-4 h-4" />
                <span>{t("studyMaterialCard.actions.download")}</span>
              </button>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onDelete();
                }}
                disabled={
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                }
                className={`w-full text-left px-4 py-2 text-sm flex items-center space-x-2 ${
                  file.status === "processing" ||
                  file.smartStructure?.status === "processing" ||
                  file.isProcessing
                    ? "opacity-50 cursor-not-allowed bg-gray-50"
                    : "text-red-500 hover:bg-gray-100"
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>{t("studyMaterialCard.actions.delete")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        {file.createdAt && file.createdAt.seconds && (
          <span>
            {(() => {
              const date = new Date(file.createdAt.seconds * 1000);
              const now = new Date();
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);

              const isToday = date.toDateString() === now.toDateString();
              const isYesterday =
                date.toDateString() === yesterday.toDateString();

              const time = date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });

              if (isToday) {
                return t("studyMaterialCard.date.todayAt", { time });
              } else if (isYesterday) {
                return t("studyMaterialCard.date.yesterdayAt", { time });
              } else {
                return t("studyMaterialCard.date.onDateAt", {
                  date: date.toLocaleDateString(i18n.language || "it-IT"),
                  time,
                });
              }
            })()}
          </span>
        )}
      </div>

      {/* Learning Materials Section */}
      {hasMaterials && (
        <div className="mt-3 pt-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-2">
            {file.mindmap && file.mindmap.status === "completed" && (
              <div
                className="flex items-center px-2 py-1 bg-purple-50 border border-purple-100 rounded-md cursor-pointer hover:bg-purple-100 transition-colors"
                onClick={handleOpenMindMap}
                title={t("studyMaterialCard.actions.openMindmap")}
              >
                <Network className="w-4 h-4 text-purple-500 mr-1" />
                <span className="text-xs font-medium text-purple-700">
                  {t("studyMaterialCard.material.mindmap")}
                </span>
              </div>
            )}

            {file.quiz && file.quiz.status === "completed" && (
              <div
                className="flex items-center px-2 py-1 bg-amber-50 border border-amber-100 rounded-md cursor-pointer hover:bg-amber-100 transition-colors"
                onClick={handleOpenQuiz}
                title={t("studyMaterialCard.actions.openQuiz")}
              >
                <BookOpenCheck className="w-4 h-4 text-amber-500 mr-1" />
                <span className="text-xs font-medium text-amber-700">
                  {t("studyMaterialCard.material.quiz")}
                </span>
              </div>
            )}

            {file.flashcards && file.flashcards.status === "completed" && (
              <div
                className="flex items-center px-2 py-1 bg-teal-50 border border-teal-100 rounded-md cursor-pointer hover:bg-teal-100 transition-colors"
                onClick={handleOpenFlashcards}
                title={t("studyMaterialCard.actions.openFlashcards")}
              >
                <SquareAsterisk className="w-4 h-4 text-teal-500 mr-1" />
                <span className="text-xs font-medium text-teal-700">
                  {t("studyMaterialCard.material.flashcards")}
                </span>
              </div>
            )}
            {isLoading && (
              <div className="flex items-center">
                <Loader2 className="w-4 h-4 animate-spin text-gray-500 mr-1" />
                <span className="text-xs text-gray-500">
                  {t("studyMaterialCard.status.loading")}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Only render portal and modals when needed */}
      {activeModal &&
        createPortal(
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
                <div className="bg-white p-4 rounded-lg shadow-lg flex items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                  <span>
                    {t("studyMaterialCard.status.loadingModal", {
                      modalType: activeModal,
                    })}
                  </span>
                </div>
              </div>
            }
          >
            {activeModal === "quiz" && (
              <QuizModal
                isOpen={true}
                onClose={handleCloseModal}
                docId={file.id}
              />
            )}

            {activeModal === "mindmap" && modalData && (
              <MindMapModal
                isOpen={true}
                onClose={handleCloseModal}
                mindMap={modalData}
              />
            )}

            {activeModal === "flashcards" && modalData && (
              <FlashcardModal
                isOpen={true}
                onClose={handleCloseModal}
                flashcards={modalData}
                sourceFiles={[file.id]}
              />
            )}
          </Suspense>,
          document.body
        )}
    </div>
  );
};

StudyMaterialCard.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string,
    fileName: PropTypes.string,
    contentType: PropTypes.string.isRequired,
    courseName: PropTypes.string,
    createdAt: PropTypes.shape({
      seconds: PropTypes.number,
      nanoseconds: PropTypes.number,
    }),
    status: PropTypes.string,
    version: PropTypes.number,
    docType: PropTypes.string,
    quiz: PropTypes.object,
    mindmap: PropTypes.object,
    flashcards: PropTypes.object,
    userId: PropTypes.string,
    smartStructure: PropTypes.shape({
      status: PropTypes.string,
      type: PropTypes.string,
    }),
    isProcessing: PropTypes.bool,
    processingType: PropTypes.string,
  }).isRequired,
  onView: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired,
  onOpenCreateModal: PropTypes.func.isRequired,
};

export default StudyMaterialCard;

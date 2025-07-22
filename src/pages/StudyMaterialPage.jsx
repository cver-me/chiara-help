import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  Suspense,
  lazy,
  startTransition,
  useDeferredValue,
} from "react";
import { updateDoc, doc, serverTimestamp, getDoc } from "firebase/firestore";
import { ref, getDownloadURL, deleteObject } from "firebase/storage";
import {
  ChevronRight,
  FileAudio,
  FileText,
  Book,
  File,
  Search,
  Loader2,
  X,
  ArrowLeft,
  Plus,
  Settings,
} from "lucide-react";
import PropTypes from "prop-types";
import { auth, db, storage } from "../utils/firebase";
import { useParams, useNavigate } from "react-router-dom";
import Upload from "../components/Upload";
import StudyMaterialPreview from "../components/StudyMaterial/StudyMaterialPreview";
import StudyMaterialCard from "../components/StudyMaterial/StudyMaterialCard";
import toast from "../components/Toast";
import LectureTranscriptPdfGenerator from "../components/StudyMaterial/LectureTranscriptPdfGenerator";
import EmptyState from "../components/EmptyState";
import { useTranslation } from "react-i18next";
import SkeletonCourseView from "../components/StudyMaterial/SkeletonCourseView";
import useUserFiles from "../hooks/useUserFiles";
import { useCourses } from "../context/CoursesContext";

const CreateModal = lazy(() => import("../components/CreateModal"));

// New constant with grouped emoji for course settings
const EMOJI_CATEGORIES = {
  "General Education & School": ["📚", "🏫", "🎓", "📝", "📖", "🗂️"],
  "STEM (Science, Technology, Engineering, Math)": [
    "🔬",
    "🧪",
    "🧬",
    "🦠",
    "⚛️",
    "📡",
    "🛰️",
    "💻",
    "🖥️",
    "🕹️",
    "📊",
    "🧮",
    "📈",
    "🛠️",
  ],
  "Humanities & Social Sciences": [
    "📜",
    "🏛️",
    "⚖️",
    "🗣️",
    "📰",
    "🧠",
    "🛐",
    "🎭",
    "🎨",
    "🖌️",
    "📷",
    "🎼",
  ],
  "Business & Economics": ["💰", "📉", "🏦", "📝", "📢", "🛒"],
  "Health & Medicine": ["⚕️", "💊", "🩺", "🦷", "🫀", "🫁"],
  "Languages & Literature": ["🗺️", "🇺🇸", "🇪🇸", "🇫🇷", "🇩🇪", "✍️", "📖", "🔤"],
  "Sports & Physical Education": ["⚽", "🏀", "🏈", "🎾", "🏋️", "🧘"],
};

// Add this constant at the top with other constants
const COURSE_COLORS = [
  "#E6B0B0", // Dusty Rose        (h ≈   0°)
  "#FF8A65", // Coral             (h ≈  14°)
  "#FFB74D", // Sand Orange       (h ≈  35°)
  "#FFD54F", // Golden            (h ≈  46°)
  "#FFF176", // Lemon Yellow      (h ≈  54°)
  "#DCE775", // Lime              (h ≈  66°)
  "#AED581", // Olive             (h ≈  88°)
  "#A5D6A7", // Sage Green        (h ≈ 122°)
  "#81C784", // Forest Green      (h ≈ 123°)
  "#4DB6AC", // Teal              (h ≈ 174°)
  "#4FC3F7", // Ocean Blue        (h ≈ 199°)
  "#90CAF9", // Sky Blue          (h ≈ 207°)
  "#7986CB", // Indigo            (h ≈ 230°)
  "#B39DDB", // Lavender          (h ≈ 261°)
  "#9575CD", // Purple            (h ≈ 262°)
  "#BA68C8", // Violet            (h ≈ 291°)
  "#F48FB1", // Salmon Pink       (h ≈ 340°)
  "#FFB6C1", // Light Pink        (h ≈ 351°)
];

// -----------------------------------------------------------------------------
// Modal Component
const Modal = ({ isOpen, onClose, title, children, footer, isNote }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 transition-opacity duration-300"
      aria-modal="true"
      role="dialog"
    >
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-sm border border-stone-200 transform transition-all duration-300">
        <div className="flex justify-between items-center p-4 border-b border-stone-200 bg-stone-50 flex-shrink-0">
          <h2 id="modal-title" className="text-xl font-semibold text-stone-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500"
            aria-label="Close Modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div
          className={`p-6 overflow-y-auto flex-grow ${isNote ? "bg-[#FDFBF7]" : ""}`}
        >
          {children}
        </div>
        {footer && (
          <div className="p-4 border-t border-stone-200 bg-stone-50 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  footer: PropTypes.node,
  isNote: PropTypes.bool,
};

// -----------------------------------------------------------------------------
// Helper function to choose the correct icon based on contentType
const getFileIcon = (contentType) => {
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

// -----------------------------------------------------------------------------
// CourseFolder Component (based on OrganizationPage)
const CourseFolder = ({
  course,
  documents,
  onDocumentClick,
  courseColor,
  selectedDocument,
  courses,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // (duplicate animation style injection removed; defined once in parent)

  return (
    <div className="space-y-1 overflow-hidden rounded-xl">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center p-3 hover:bg-stone-50 rounded-lg transition-all duration-200 group"
        style={{
          background: isExpanded ? `${courseColor}15` : "transparent",
        }}
      >
        {/* Folder Icon with Animation */}
        <div className="relative mr-3 flex-shrink-0">
          <div
            className={`absolute inset-0 rounded-md transition-all duration-300 ${
              isExpanded ? "scale-100 opacity-100" : "scale-90 opacity-0"
            }`}
            style={{
              background: `${courseColor}30`,
              boxShadow: `0 0 0 1px ${courseColor}40 inset`,
            }}
          />
          <div
            className={`transform transition-transform duration-300 ease-spring ${
              isExpanded ? "rotate-90" : ""
            }`}
          >
            <ChevronRight className="w-4 h-4 text-stone-500" />
          </div>
        </div>

        {/* Emoji with Animation */}
        <div className="relative mr-2 flex-shrink-0">
          <span
            className="text-3xl block transition-transform duration-300
            group-hover:scale-110 drop-shadow-sm"
            style={{
              filter: isExpanded ? "saturate(1.2)" : "saturate(1)",
            }}
          >
            {courses[course]?.emoji || "📚"}
          </span>

          {/* Emoji Glow Effect */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md -z-10"
            style={{
              background: `radial-gradient(circle, ${courseColor}60 0%, transparent 70%)`,
            }}
          />
        </div>

        {/* Course Name */}
        <div className="flex-1 flex items-center">
          <div
            className="text-[15px] font-medium px-3 py-1.5 rounded-lg text-stone-700 transition-all duration-300"
            style={{
              backgroundColor: `${courseColor}25`,
              border: `1px solid ${courseColor}40`,
              boxShadow: isExpanded
                ? `0 0 0 1px ${courseColor}30, 0 2px 5px ${courseColor}20`
                : `0 0 0 1px ${courseColor}20`,
            }}
          >
            {course}
          </div>

          {/* File Count Badge */}
          <div
            className="ml-3 px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-300"
            style={{
              backgroundColor: isExpanded
                ? `${courseColor}30`
                : "rgb(229 231 235)",
              color: isExpanded ? `${courseColor}DD` : "rgb(107 114 128)",
            }}
          >
            {documents.length}
          </div>
        </div>
      </button>

      {/* Document List with Animation */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div
          className="ml-10 pt-1 pb-2 space-y-1 border-l-2 pl-3 transition-colors duration-300"
          style={{
            borderColor: `${courseColor}40`,
          }}
        >
          {documents.map((doc, index) => (
            <button
              key={doc.id}
              onClick={() => onDocumentClick(doc)}
              className={`w-full flex items-center p-2.5 rounded-lg transition-all duration-200 
                ${
                  selectedDocument?.id === doc.id
                    ? "bg-stone-100 shadow-sm"
                    : "hover:bg-stone-50"
                }
                ${index === 0 ? "animate-fadeIn" : ""}
              `}
              style={{
                animationDelay: `${index * 50}ms`,
                ...(selectedDocument?.id === doc.id
                  ? {
                      backgroundColor: `${courseColor}15`,
                      boxShadow: `0 0 0 1px ${courseColor}30 inset`,
                    }
                  : {}),
              }}
            >
              <div className="mr-3 flex-shrink-0 transition-transform group-hover:scale-110 duration-200">
                {getFileIcon(doc.contentType)}
              </div>

              <div className="flex-1 flex flex-col items-start">
                <span className="text-sm font-medium truncate text-left text-stone-700">
                  {doc.fileName}
                </span>

                {/* File Type Label */}
                <span className="text-xs text-stone-400 mt-0.5">
                  {doc.contentType?.split("/")[1]?.toUpperCase() || "FILE"}
                </span>
              </div>

              {/* Processing Indicator */}
              {(doc.status === "processing" ||
                doc.smartStructure?.status === "processing") && (
                <div className="ml-2 flex-shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                  {doc.smartStructure?.status === "processing" &&
                    doc.smartStructure?.type === "transcription" && (
                      <span className="text-xs text-stone-400 whitespace-nowrap ml-1">
                        Transcribing...
                      </span>
                    )}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

CourseFolder.propTypes = {
  course: PropTypes.string.isRequired,
  documents: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      fileName: PropTypes.string.isRequired,
      contentType: PropTypes.string.isRequired,
    })
  ).isRequired,
  onDocumentClick: PropTypes.func.isRequired,
  courseColor: PropTypes.string.isRequired,
  selectedDocument: PropTypes.object,
  courses: PropTypes.object.isRequired,
};

// -----------------------------------------------------------------------------
// Main Study Material Component
const StudyMaterialPage = () => {
  const { t } = useTranslation();
  // Add animation styles
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn {
        animation: fadeIn 0.3s ease-out forwards;
      }
      .ease-spring {
        transition-timing-function: cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
    `;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  const { courseId } = useParams();
  const navigate = useNavigate();

  // Common states
  const [searchQuery, setSearchQuery] = useState("");
  const { courses, isLoadingCourses } = useCourses();

  // User files obtained via custom hook
  const { uploadedDocs } = useUserFiles();

  // For preview modal (common for both sections)
  const [selectedFile, setSelectedFile] = useState(null);

  // For Upload modal and progress tracking
  const [showUpload, setShowUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Add this state for the settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  // Add showPdfGenerator to the existing state declarations
  const [showPdfGenerator, setShowPdfGenerator] = useState(false);
  const [pdfGeneratorProps, setPdfGeneratorProps] = useState(null);

  // Add debug counter
  const [downloadAttempts, setDownloadAttempts] = useState(0);

  // Add state for CreateModal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalFile, setCreateModalFile] = useState(null);

  // Defer expensive filtering to keep typing responsive
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Get current course data
  const currentCourse = useMemo(
    () => (courseId ? courses[courseId] : null),
    [courseId, courses]
  );

  // Redirect if we have loaded courses and the courseId is invalid
  useEffect(() => {
    if (!isLoadingCourses && courseId && !currentCourse) {
      navigate("/study-material");
    }
  }, [isLoadingCourses, courseId, currentCourse, navigate]);

  // Listeners handled in useUserFiles hook

  // ---------------------------------------------------------------------------
  // Combine uploaded and generated files, apply filtering, and group them by course
  const allFiles = useMemo(
    () => [
      ...uploadedDocs.map((doc) => ({
        ...doc,
        createdAt: doc.createdAt,
        type: doc.docType || "upload",
        contentType: doc.contentType,
        userName: auth.currentUser?.displayName,
        courseId: doc.courseId || "uncategorized",
        version: doc.currentVersion || 1,
        userId: auth.currentUser?.uid,
        // Preserve processing status
        isProcessing:
          doc.status === "processing" ||
          doc.smartStructure?.status === "processing",
        processingType: doc.smartStructure?.type || "document",
      })),
    ],
    [uploadedDocs]
  );

  const filteredFiles = useMemo(
    () =>
      deferredSearchQuery
        ? allFiles.filter(
            (file) =>
              file.fileName
                .toLowerCase()
                .includes(deferredSearchQuery.toLowerCase()) ||
              (file.courseId &&
                courses[file.courseId]?.name
                  .toLowerCase()
                  .includes(deferredSearchQuery.toLowerCase()))
          )
        : allFiles,
    [allFiles, deferredSearchQuery, courses]
  );

  const { groupedFiles, totalFileCount } = useMemo(() => {
    const grouped = {};
    filteredFiles.forEach((file) => {
      const courseId = file.courseId || "uncategorized";
      if (!grouped[courseId]) grouped[courseId] = [];
      grouped[courseId].push(file);
    });

    return { groupedFiles: grouped, totalFileCount: filteredFiles.length };
  }, [filteredFiles]);

  // ---------------------------------------------------------------------------
  // Handler: Open a preview (for both uploaded and generated files)
  const handleView = useCallback(async (item) => {
    setSelectedFile({ ...item, loading: true });
    try {
      const storageRef = ref(storage, item.storagePath);
      const url = await getDownloadURL(storageRef);

      // Get the latest document data to ensure we have smartStructure
      const docRef = doc(db, `users/${auth.currentUser.uid}/docs/${item.id}`);
      const docSnap = await getDoc(docRef);
      const latestDocData = docSnap.exists() ? docSnap.data() : null;

      if (
        item.type === "lecture_transcript" ||
        item.contentType === "text/markdown"
      ) {
        // Check smartStructure for markdown content first
        const markdownContent = latestDocData?.smartStructure?.markdown;
        if (markdownContent) {
          setSelectedFile({
            ...item,
            url,
            type: "markdown",
            markdown: markdownContent,
            smartStructure: latestDocData?.smartStructure,
          });
        } else {
          // If no smartStructure.markdown, fetch raw file
          const response = await fetch(url);
          const text = await response.text();
          // Pass the raw markdown text
          setSelectedFile({
            ...item,
            url,
            type: "markdown",
            markdown: text,
            smartStructure: latestDocData?.smartStructure,
          });
        }
      } else {
        setSelectedFile({
          ...item,
          url,
          smartStructure: latestDocData?.smartStructure,
        });
      }
    } catch (error) {
      console.error("Error fetching file preview:", error);
      setSelectedFile(null);
      toast.error("Failed to load file preview");
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers for file upload (copied/adapted from OrganizationPage)
  const handleFileUpload = useCallback(async () => {
    try {
      console.log(
        "Upload completed; courses will refresh via context snapshot"
      );
    } catch (error) {
      console.error("Initial upload setup error:", error);
      toast.error("Failed to refresh courses after upload");
    }
  }, []);

  const handleUploadClose = useCallback(() => {
    if (
      !uploadStatus ||
      uploadStatus === "completed" ||
      uploadStatus === "error"
    ) {
      setShowUpload(false);
      setUploadProgress(0);
      setProcessingProgress(0);
      setUploadStatus(null);
    }
  }, [uploadStatus]);

  // ---------------------------------------------------------------------------
  // Common handlers for both uploaded and generated files
  const handleDownload = useCallback(
    async (file) => {
      const attemptId = downloadAttempts + 1;
      setDownloadAttempts(attemptId);

      console.log(`[Debug] Download attempt #${attemptId} started`, {
        fileType: file.type,
        fileName: file.fileName,
      });

      try {
        if (file.type === "lecture_transcript") {
          if (showPdfGenerator) {
            console.log(
              `[Debug] #${attemptId} - PDF generation already in progress, skipping`
            );
            return;
          }

          toast.loading("Generating PDF...");

          setPdfGeneratorProps({
            storagePath: file.storagePath,
            fileName: file.fileName,
            courseName: courses[file.courseId]?.name || "Uncategorized",
            onComplete: () => {
              toast.dismiss();
              toast.success(`"${file.fileName}" downloaded`);
              setShowPdfGenerator(false);
              setPdfGeneratorProps(null);
              setSelectedFile(null);
            },
            onError: (error) => {
              console.error("PDF generation failed:", error);
              toast.dismiss();
              toast.error("Failed to generate PDF");
              setShowPdfGenerator(false);
              setPdfGeneratorProps(null);
            },
          });

          setShowPdfGenerator(true);
        } else {
          // Regular file download logic
          const storageRef = ref(storage, file.storagePath);
          const url = await getDownloadURL(storageRef);
          const response = await fetch(url);
          const blob = await response.blob();
          const downloadUrl = URL.createObjectURL(blob);

          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = file.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);

          toast.success(`"${file.fileName}" downloaded`);
        }
      } catch (error) {
        console.error(`[Debug] #${attemptId} - Download failed:`, error);
        toast.error("Failed to download file");
      }
    },
    [downloadAttempts, showPdfGenerator, courses]
  );

  const handleRename = useCallback(async (id, newTitle, type) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      let collectionPath;
      if (type === "lecture_transcript") {
        collectionPath = `users/${user.uid}/lecture_transcripts`;
      } else {
        collectionPath = `users/${user.uid}/docs`;
      }

      const docRef = doc(db, collectionPath, id);
      await updateDoc(docRef, {
        [type === "upload" ? "fileName" : "title"]: newTitle,
        updatedAt: serverTimestamp(),
      });

      toast.success("File renamed successfully");
    } catch (error) {
      console.error("Error updating title:", error);
      toast.error("Failed to rename file");
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers for updating title and deleting files
  const handleDelete = useCallback(
    async (item) => {
      console.log("[Delete Debug] Starting deletion process for item:", {
        id: item.id,
        type: item.type,
        fileName: item.fileName || item.title,
        storagePath: item.storagePath,
        courseId: item.courseId,
      });

      const confirmDelete = window.confirm(t("studyMaterial.confirmDelete"));
      if (!confirmDelete) {
        console.log("[Delete Debug] User cancelled deletion");
        return;
      }

      try {
        const user = auth.currentUser;
        if (!user) {
          console.error("[Delete Debug] No authenticated user found");
          return;
        }

        // Simplified: Always target the storagePath from the item for deletion
        // The backend trigger (onFileDelete) will handle Firestore cleanup
        try {
          console.log("[Delete Debug] Deleting file from storage:", {
            id: item.id,
            storagePath: item.storagePath,
          });

          const storageRef = ref(storage, item.storagePath);
          await deleteObject(storageRef);
          console.log("[Delete Debug] File deleted from storage successfully");

          // Let the storage trigger handle Firestore cleanup
          toast.success("File deletion initiated");
        } catch (error) {
          console.error("[Delete Debug] Error deleting file from storage:", {
            error: error.message,
            code: error.code,
            stack: error.stack,
          });

          if (error.code === "storage/object-not-found") {
            console.log(
              "[Delete Debug] File not found in storage, might be already deleted"
            );
            // No need for toast error if backend will clean up Firestore anyway
          } else {
            console.error(
              "[Delete Debug] Unexpected error during deletion:",
              error
            );
            toast.error(`Failed to delete file: ${error.message}`);
          }
        } // End try-catch for deleteObject
      } catch (error) {
        console.error("[Delete Debug] Top level error:", {
          error: error.message,
          code: error.code,
          stack: error.stack,
        });
        toast.error("Failed to delete file");
      }
    },
    [t]
  );

  // ---------------------------------------------------------------------------
  // Add this handler function
  const handleCourseUpdate = useCallback(
    async (updates) => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const courseRef = doc(
          db,
          `users/${user.uid}/courses/${editingCourse.id}`
        );

        // Create the update object with the course name
        const updateData = {
          name: updates.name || courses[editingCourse.id]?.name,
          color: updates.color || courses[editingCourse.id]?.color,
          emoji: updates.emoji || courses[editingCourse.id]?.emoji,
        };

        await updateDoc(courseRef, updateData);

        // changes will propagate via snapshot listener in CoursesProvider
        setShowSettings(false);
        toast.success("Course updated successfully");
      } catch (error) {
        console.error("Error updating course:", error);
        toast.error("Failed to update course");
      }
    },
    [editingCourse, courses]
  );

  // Handler to open CreateModal from a file card
  const handleOpenCreateModal = (file) => {
    setCreateModalFile(file);
    setShowCreateModal(true);
  };

  // Show loading state while courses are being fetched
  if (courseId && isLoadingCourses) {
    return (
      <div className="container mx-auto px-4 py-6">
        <SkeletonCourseView />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Rendering
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header with search */}
      {!courseId ? (
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-gray-900">
              {t("studyMaterial.title")}
            </h1>
            <p className="text-sm text-gray-600">
              {t("studyMaterial.fileCount", { count: totalFileCount })}
            </p>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400 w-4 h-4 transition-colors group-hover:text-stone-500" />
              <input
                type="text"
                placeholder={t("studyMaterial.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  startTransition(() => setSearchQuery(value));
                }}
                className="group w-full pl-9 pr-4 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400 hover:border-stone-300 transition-all"
              />
            </div>
            <button
              onClick={() => setShowUpload(true)}
              title={t("studyMaterial.uploadFile")}
              className="px-4 py-2 text-sm rounded-lg flex items-center justify-center gap-2 transition-all duration-200 bg-stone-800 text-white hover:bg-stone-600"
            >
              <Plus className="w-4 h-4" />
              {t("studyMaterial.uploadFile")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-6">
          <div className="flex flex-col gap-1 animate-fadeIn">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate("/study-material")}
                title={t("studyMaterial.back")}
                className="flex items-center text-primary hover:text-primary-dark"
              >
                <ArrowLeft className="w-5 h-5 mr-1" />
              </button>
              <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-3">
                <span className="text-3xl">{currentCourse?.emoji || "📚"}</span>
                <span
                  className="underline decoration-4"
                  style={{
                    textDecorationColor: `${currentCourse?.color || "#6B7280"}`,
                  }}
                >
                  {currentCourse?.name || t("studyMaterial.untitledCourse")}
                </span>
              </h1>
              <button
                onClick={() => {
                  setEditingCourse({
                    id: courseId,
                    ...currentCourse,
                    emoji: currentCourse?.emoji || "📚",
                  });
                  setShowSettings(true);
                }}
                className="ml-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Settings className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              {currentCourse
                ? t("studyMaterial.filesInCourse", {
                    count: groupedFiles[courseId]?.length || 0,
                  })
                : t("studyMaterial.loading")}
            </p>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400 w-4 h-4 transition-colors group-hover:text-stone-500" />
              <input
                type="text"
                placeholder={t("studyMaterial.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  startTransition(() => setSearchQuery(value));
                }}
                className="group w-full pl-9 pr-4 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400 hover:border-stone-300 transition-all"
              />
            </div>
            <button
              onClick={() => setShowUpload(true)}
              title={t("studyMaterial.uploadFile")}
              className="px-4 py-2 text-sm rounded-lg flex items-center justify-center gap-2 transition-all duration-200 bg-stone-800 text-white hover:bg-stone-600"
            >
              <Plus className="w-4 h-4" />
              {t("studyMaterial.uploadFile")}
            </button>
          </div>
        </div>
      )}

      {/* Empty state when there are no files */}
      {totalFileCount === 0 && !searchQuery && !courseId && (
        <div className="max-w-2xl mx-auto">
          <EmptyState type="upload" showButton={false} />
        </div>
      )}

      {/* Conditional Rendering:
          • If no search and no courseId, show a folder view (one card per course)
          • If a courseId is present, show only that course's files with a 'back' button
          • If a search exists, show all matching files grouped by course */}
      {!searchQuery && !courseId && totalFileCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Object.entries(groupedFiles).map(([courseId, files]) => {
            const course = courses[courseId];
            const color = course?.color || "#6B7280";
            return (
              <div
                key={courseId}
                onClick={() => navigate(`/study-material/${courseId}`)}
                className="group cursor-pointer transition-all duration-200 transform hover:-translate-y-1"
              >
                <div className="relative aspect-[5/3] rounded-xl overflow-hidden">
                  {/* Folder Background with Gradient */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(145deg, ${color}20, ${color}40)`,
                    }}
                  />

                  {/* Folder Tab */}
                  <div
                    className="absolute top-0 left-5 right-5 h-[20px] rounded-t-lg"
                    style={{
                      background: `linear-gradient(180deg, ${color}, ${color}dd)`,
                      boxShadow: `
                        inset 0 1px 1px rgba(255,255,255,0.3),
                        0 1px 3px rgba(0,0,0,0.1)
                      `,
                    }}
                  />

                  {/* Main Folder Body */}
                  <div
                    className="absolute top-[16px] left-0 right-0 bottom-0 rounded-lg p-5 overflow-hidden"
                    style={{
                      background: `linear-gradient(160deg, ${color}, ${color}dd)`,
                      boxShadow: `
                        inset 0 1px 1px rgba(255,255,255,0.3),
                        0 10px 20px rgba(0,0,0,0.15),
                        0 2px 6px rgba(0,0,0,0.1)
                      `,
                    }}
                  >
                    {/* Folder Content */}
                    <div className="h-full flex flex-col justify-between relative z-10">
                      <div className="flex items-start gap-3">
                        {/* Emoji */}
                        <span
                          className="text-4xl drop-shadow-md block
                          group-hover:scale-110 transition-transform duration-200"
                        >
                          {course?.emoji || "📚"}
                        </span>

                        {/* Course Name */}
                        <h3
                          className="text-xl font-bold text-white leading-tight drop-shadow 
                          group-hover:text-white transition-colors duration-200"
                        >
                          {course?.name || "Uncategorized"}
                        </h3>
                      </div>

                      {/* File Count Badge */}
                      <div
                        className="mt-3 px-3 py-1.5 bg-black/10 backdrop-blur-sm
                        rounded-lg inline-flex items-center gap-2 w-fit
                        group-hover:bg-black/20 transition-colors duration-200
                        border border-white/10"
                      >
                        <File className="w-4 h-4 text-white/80" />
                        <span className="text-sm font-medium text-white">
                          {files.length} {files.length === 1 ? "file" : "files"}
                        </span>
                      </div>
                    </div>

                    {/* Shine Effect - simplified duration */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100
                      transition-opacity duration-200"
                      style={{
                        background: `
                          linear-gradient(
                            45deg,
                            transparent 0%,
                            rgba(255,255,255,0.1) 45%,
                            rgba(255,255,255,0.15) 50%,
                            rgba(255,255,255,0.1) 55%,
                            transparent 100%
                          )
                        `,
                      }}
                    />
                  </div>

                  {/* Paper Stack Effect - simplified */}
                  <div
                    className="absolute -bottom-1 left-1 right-1 h-[6px] rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      background: color,
                      filter: "brightness(0.85)",
                      boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!searchQuery && courseId && currentCourse && (
        <div className="animate-fadeIn grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupedFiles[courseId]?.length > 0 ? (
            groupedFiles[courseId]?.map((file) => (
              <StudyMaterialCard
                key={file.id}
                file={file}
                onView={() => handleView(file)}
                onRename={(id, newTitle) =>
                  handleRename(id, newTitle, file.type)
                }
                onDelete={() => handleDelete(file)}
                onDownload={() => handleDownload(file)}
                onOpenCreateModal={handleOpenCreateModal}
              />
            ))
          ) : (
            <div className="col-span-full max-w-2xl mx-auto w-full">
              <EmptyState type="upload" showButton={false} />
            </div>
          )}
        </div>
      )}

      {searchQuery && (
        <>
          {Object.entries(groupedFiles).map(([courseId, files]) => {
            const course = courses[courseId];
            return (
              <div key={courseId} className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">
                  {course?.name || "Uncategorized"} ({files.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {files.map((file) => (
                    <StudyMaterialCard
                      key={file.id}
                      file={file}
                      onView={() => handleView(file)}
                      onRename={(id, newTitle) =>
                        handleRename(id, newTitle, file.type)
                      }
                      onDelete={() => handleDelete(file)}
                      onDownload={() => handleDownload(file)}
                      onOpenCreateModal={handleOpenCreateModal}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* PDF Generator - keep only this one instance */}
      {showPdfGenerator && pdfGeneratorProps && (
        <LectureTranscriptPdfGenerator {...pdfGeneratorProps} />
      )}

      {/* Upload Modal */}
      <Upload
        isOpen={showUpload}
        onClose={handleUploadClose}
        onFileUpload={handleFileUpload}
        uploadProgress={uploadProgress}
        processingProgress={processingProgress}
        uploadStatus={uploadStatus}
      />

      {/* Preview (if a file is selected) */}
      <StudyMaterialPreview
        fileDocument={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDownload={() => selectedFile && handleDownload(selectedFile)}
      />

      {/* Course Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title={t("studyMaterial.courseSettings")}
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              {t("studyMaterial.cancel")}
            </button>
            <button
              onClick={() =>
                handleCourseUpdate({
                  name: editingCourse.name,
                  color: editingCourse.color,
                  emoji: editingCourse.emoji,
                })
              }
              className="px-4 py-2 text-sm rounded-lg bg-stone-700 text-white hover:bg-stone-600"
            >
              {t("studyMaterial.saveChanges")}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Course Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("studyMaterial.courseName")}
            </label>
            <input
              type="text"
              value={editingCourse?.name || ""}
              onChange={(e) =>
                setEditingCourse((prev) => ({
                  ...prev,
                  name: e.target.value || prev.name,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-300 transition-colors duration-200"
            />
          </div>

          {/* Course Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("studyMaterial.courseColor")}
            </label>
            <div className="flex gap-2 flex-wrap">
              {COURSE_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() =>
                    setEditingCourse((prev) => ({
                      ...prev,
                      color,
                    }))
                  }
                  className={`w-8 h-8 rounded-lg transition-all duration-200 hover:bg-gray-100 flex items-center justify-center ${
                    editingCourse?.color === color
                      ? "ring-2 ring-stone-400"
                      : ""
                  }`}
                  title={color}
                >
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4)",
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Course Emoji */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("studyMaterial.courseEmoji")}
            </label>
            {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category} className="mb-3">
                <h4 className="text-xs font-semibold text-gray-600 mb-1">
                  {t(`studyMaterial.emojiCategories.${category}`)}
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() =>
                        setEditingCourse((prev) => ({
                          ...prev,
                          emoji,
                        }))
                      }
                      className={`text-2xl p-2 rounded-lg hover:bg-gray-100 ${
                        editingCourse?.emoji === emoji
                          ? "bg-gray-100 ring-2 ring-stone-400"
                          : ""
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Create Modal */}
      <Suspense fallback={null}>
        <CreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          fileData={createModalFile}
        />
      </Suspense>
    </div>
  );
};

StudyMaterialPage.propTypes = {};

export default StudyMaterialPage;

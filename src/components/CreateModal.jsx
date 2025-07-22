import React, { useState, useEffect, useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { useNavigate, useLocation } from "react-router-dom";
import {
  X,
  FileText,
  Network,
  SquareAsterisk,
  Loader2,
  Search as SearchIcon,
  ChevronRight,
  CheckCircle,
  Circle,
  FileUp,
  FileEdit,
  FileAudio,
  File,
  BookOpenCheck,
} from "lucide-react";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { auth, db, functions } from "../utils/firebase";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";

//-----------------------------------------------------------------------------
// Constants
//-----------------------------------------------------------------------------

const ALLOWED_TYPES = {
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/m4a"],
  document: [
    "text/plain",
    "text/markdown",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

// Define creation type info outside the component, only translate the name/desc/tooltip inside
const CREATION_TYPE_BASE_INFO = {
  lecture_transcript: {
    key: "lecture_transcript",
    icon: FileText,
    color: "blue",
  },
  mindmap: {
    key: "mindmap",
    icon: Network,
    color: "purple",
  },
  quiz: {
    key: "quiz",
    icon: BookOpenCheck,
    color: "amber",
  },
  flashcards: {
    key: "flashcards",
    icon: SquareAsterisk,
    color: "teal",
  },
};

//-----------------------------------------------------------------------------
// Utility Functions
//-----------------------------------------------------------------------------

const getFileIcon = (contentType) => {
  if (!contentType) return <File className="w-5 h-5 text-gray-500" />;

  if (contentType.startsWith("audio/")) {
    return <FileAudio className="w-5 h-5 text-gray-500" />;
  }

  return <FileText className="w-5 h-5 text-gray-500" />;
};

//-----------------------------------------------------------------------------
// UI Components
//-----------------------------------------------------------------------------

const Tooltip = React.memo(({ children, content }) => (
  <div className="relative group inline-block">
    {children}
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50">
      <div className="bg-gray-800 text-white text-xs px-3 py-2 rounded-md shadow-lg whitespace-normal max-w-[240px]">
        {content}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-800"></div>
      </div>
    </div>
  </div>
));

Tooltip.displayName = "Tooltip";

Tooltip.propTypes = {
  children: PropTypes.node.isRequired,
  content: PropTypes.string.isRequired,
};

const EmptyState = ({ type }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="rounded-full bg-gray-100 p-3 mb-4">
        <FileUp className="h-6 w-6 text-gray-500" />
      </div>
      <h3 className="text-base font-medium text-gray-700 mb-2 md:text-lg">
        {t("createModal.emptyState.noFilesAvailable")}
      </h3>
      <p className="text-gray-500 max-w-md text-xs md:text-sm">
        {type === "upload"
          ? t("createModal.emptyState.uploadFilesPrompt")
          : t("createModal.emptyState.noMatchingFiles")}
      </p>
    </div>
  );
};

EmptyState.propTypes = {
  type: PropTypes.string.isRequired,
};

const NoSearchResults = ({ searchTerm }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <SearchIcon className="h-6 w-6 text-gray-400 mb-4" />
      <h3 className="text-base font-medium text-gray-700 mb-2 md:text-lg">
        {t("createModal.noSearchResults.title")}
      </h3>
      <p className="text-gray-500 text-xs md:text-sm">
        {t("createModal.noSearchResults.description", { searchTerm })}
      </p>
    </div>
  );
};

NoSearchResults.propTypes = {
  searchTerm: PropTypes.string.isRequired,
};

const DocumentList = React.memo(
  ({
    filteredGroups,
    expandedCourse,
    setExpandedCourse,
    selectedDocument,
    handleDocumentSelect,
    formatDate,
  }) => {
    return (
      <div className="space-y-2">
        {Object.entries(filteredGroups).map(([courseName, docs]) => (
          <div key={courseName} className="rounded-lg bg-white">
            <button
              onClick={() =>
                setExpandedCourse(
                  expandedCourse === courseName ? null : courseName
                )
              }
              className="w-full flex items-center space-x-2 p-2.5 hover:bg-gray-50 rounded-lg transition-all duration-200 group"
            >
              <div
                className={`transform transition-transform duration-200 ${
                  expandedCourse === courseName ? "rotate-90" : ""
                }`}
              >
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              </div>
              <div
                className="text-[15px] font-medium px-2 py-0.5 rounded-md text-gray-700"
                style={{
                  backgroundColor: `${docs[0].courseColor}45`,
                  border: `1.5px solid ${docs[0].courseColor}70`,
                  boxShadow: `inset 0 0 0 1px ${docs[0].courseColor}10`,
                }}
              >
                {courseName}
              </div>
              <span className="text-xs text-gray-400 group-hover:text-gray-500">
                ({docs.length})
              </span>
            </button>

            {expandedCourse === courseName && (
              <div className="ml-4 space-y-0.5 border-l-2 border-gray-100 pl-2">
                {docs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => handleDocumentSelect(doc)}
                    className={`w-full flex items-start space-x-2 p-2.5 rounded-lg transition-all duration-200 group text-left
                  ${
                    selectedDocument?.id === doc.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-gray-50 text-gray-700 hover:text-gray-900"
                  }`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {selectedDocument?.id === doc.id ? (
                        <CheckCircle className="w-5 h-5 text-primary" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium truncate">
                          {doc.fileName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(doc.uploadDate)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
);

DocumentList.displayName = "DocumentList";

DocumentList.propTypes = {
  filteredGroups: PropTypes.object.isRequired,
  expandedCourse: PropTypes.string,
  setExpandedCourse: PropTypes.func.isRequired,
  selectedDocument: PropTypes.object,
  handleDocumentSelect: PropTypes.func.isRequired,
  formatDate: PropTypes.func.isRequired,
};

const SuccessMessage = ({ successMessage, creationType, onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/95 z-10 rounded-xl">
      <div className="text-center p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">
          {successMessage}
        </h3>
        <p className="text-gray-500 mb-6">
          {creationType === "lecture_transcript"
            ? t("createModal.success.transcriptionMessage")
            : t("createModal.success.generalMessage")}
        </p>
        <button
          onClick={onClose}
          className="px-6 py-2 text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors"
        >
          {t("createModal.buttons.ok")}
        </button>
      </div>
    </div>
  );
};

SuccessMessage.propTypes = {
  successMessage: PropTypes.string.isRequired,
  creationType: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

const CreationTypeButton = React.memo(
  ({ icon: Icon, title, isActive, onClick, color }) => (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-lg transition-all duration-200 text-center
                  w-[calc(50%-theme(spacing.1))] p-2 h-[70px] 
                  md:min-w-[100px] md:flex-1 md:p-3 md:h-[80px]
                  ${
                    isActive
                      ? `bg-${color}-100 border-2 border-${color}-500`
                      : `bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow-md`
                  }`}
    >
      <div
        className={`rounded-full flex items-center justify-center transition-colors duration-200
                    w-7 h-7 mb-1 
                    md:w-8 md:h-8 md:mb-1.5 
                    ${
                      isActive
                        ? `bg-${color}-200`
                        : `bg-gray-100 group-hover:bg-gray-200`
                    }`}
      >
        <Icon
          className={`transition-colors duration-200
                      w-4 h-4 
                      md:w-5 md:h-5 
                      ${
                        isActive
                          ? `text-${color}-600`
                          : `text-gray-500 group-hover:text-gray-600`
                      }`}
        />
      </div>
      <span
        className={`font-medium transition-colors duration-200
                    text-[11px] 
                    md:text-xs 
                    ${isActive ? `text-${color}-900` : `text-gray-700`}`}
      >
        {title}
      </span>
    </button>
  )
);

CreationTypeButton.displayName = "CreationTypeButton";

CreationTypeButton.propTypes = {
  icon: PropTypes.elementType.isRequired,
  title: PropTypes.string.isRequired,
  isActive: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  color: PropTypes.string.isRequired,
};

const FileInfoHeader = ({ fileData }) => {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
      {getFileIcon(fileData.contentType || fileData.type)}
      <div className="ml-3">
        <div className="font-medium text-gray-900">
          {fileData.title || fileData.fileName}
        </div>
        <div className="text-sm text-gray-500">
          {fileData.courseName &&
            `${t("createModal.fileInfo.courseLabel")}: ${fileData.courseName}`}
        </div>
      </div>
    </div>
  );
};

FileInfoHeader.propTypes = {
  fileData: PropTypes.object.isRequired,
};

const DocumentSearch = ({ hasDocuments, searchTerm, setSearchTerm }) => {
  const { t } = useTranslation();
  return (
    hasDocuments && (
      <div className="mb-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder={t("createModal.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-stone-200 focus:border-stone-400"
          />
        </div>
      </div>
    )
  );
};

DocumentSearch.propTypes = {
  hasDocuments: PropTypes.bool.isRequired,
  searchTerm: PropTypes.string.isRequired,
  setSearchTerm: PropTypes.func.isRequired,
};

const DocumentTabs = ({ showTranscribed, activeTab, setActiveTab }) => {
  const { t } = useTranslation();
  return (
    <div className="border-b border-gray-200 mb-4">
      <div className="flex space-x-4">
        <button
          onClick={() => setActiveTab("uploaded")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-xs md:text-sm ${
            activeTab === "uploaded"
              ? "border-stone-600 text-stone-700"
              : "border-transparent text-gray-400 hover:text-stone-600 hover:border-stone-300"
          }`}
        >
          <FileUp className="w-4 h-4" />
          {t("createModal.tabs.uploaded")}
        </button>
        {showTranscribed && (
          <button
            onClick={() => setActiveTab("transcribed")}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-xs md:text-sm ${
              activeTab === "transcribed"
                ? "border-stone-600 text-stone-700"
                : "border-transparent text-gray-400 hover:text-stone-600 hover:border-stone-300"
            }`}
          >
            <FileEdit className="w-4 h-4" />
            {t("createModal.tabs.transcribed")}
          </button>
        )}
      </div>
    </div>
  );
};

DocumentTabs.propTypes = {
  showTranscribed: PropTypes.bool.isRequired,
  activeTab: PropTypes.string.isRequired,
  setActiveTab: PropTypes.func.isRequired,
};

//-----------------------------------------------------------------------------
// Main Component
//-----------------------------------------------------------------------------

const CreateModal = ({ isOpen, onClose, fileData }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  //-------------------------
  // State Management
  //-------------------------
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showingSuccess, setShowingSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState("uploaded");
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [creationType, setCreationType] = useState("lecture_transcript");
  const [documents, setDocuments] = useState({ uploaded: [], transcribed: [] });
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [availableCreationTypes, setAvailableCreationTypes] = useState({
    lecture_transcript: true,
    mindmap: true,
    quiz: true,
    flashcards: true,
  });
  const [retryTime, setRetryTime] = useState(null);

  // Define an explicit order for creation types
  const ORDERED_CREATION_KEYS = useMemo(
    () => ["lecture_transcript", "mindmap", "quiz", "flashcards"],
    []
  );

  //-------------------------
  // Helper Functions
  //-------------------------
  const formatDate = useCallback(
    (date) => {
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const oneDay = 24 * 60 * 60 * 1000;

      if (diff < oneDay && date.getDate() === now.getDate()) {
        return t("createModal.formatDate.today", {
          time: date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      } else if (diff < 2 * oneDay && date.getDate() === now.getDate() - 1) {
        return t("createModal.formatDate.yesterday", {
          time: date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      } else {
        return date.toLocaleDateString([], {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    },
    [t]
  );

  const getDocumentPickerConfig = useCallback(() => {
    switch (creationType) {
      case "lecture_transcript":
        return {
          allowedType: "audio",
          showTranscribed: false,
        };
      case "mindmap":
      case "quiz":
      case "flashcards":
        return {
          allowedType: "document",
          showTranscribed: true,
        };
      default:
        return {
          allowedType: null,
          showTranscribed: false,
        };
    }
  }, [creationType]);

  const processDocuments = useCallback(
    (snapshot, courses) => {
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        const course = courses[data.courseId];
        const isTranscribed =
          data.smartStructure?.type === "transcription" &&
          data.smartStructure?.status === "completed";

        return {
          id: doc.id,
          ...data,
          fileName: data.fileName,
          courseName: course?.name || t("createModal.uncategorized"),
          courseColor: course?.color || "#6B7280",
          uploadDate:
            data.createdAt?.toDate?.() ||
            new Date(data.createdAt?.seconds * 1000) ||
            new Date(),
          type: data.contentType || "application/octet-stream",
          isTranscribed,
        };
      });
    },
    [t]
  );

  const getGroupedAndFilteredDocuments = useCallback(() => {
    const currentDocs = documents[activeTab] || [];

    // Group by course
    const groupedDocs = currentDocs.reduce((acc, doc) => {
      const courseName = doc.courseName || t("createModal.uncategorized");
      if (!acc[courseName]) {
        acc[courseName] = [];
      }
      acc[courseName].push(doc);
      return acc;
    }, {});

    // Apply search filter if needed
    if (!searchTerm) return groupedDocs;

    const filtered = {};
    Object.entries(groupedDocs).forEach(([courseName, docs]) => {
      const filteredDocs = docs.filter(
        (doc) =>
          doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          courseName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filteredDocs.length > 0) {
        filtered[courseName] = filteredDocs;
      }
    });
    return filtered;
  }, [documents, activeTab, searchTerm, t]);

  //-------------------------
  // API Interactions
  //-------------------------
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const user = auth.currentUser;
      if (!user) {
        setError(t("createModal.errors.notAuthenticated"));
        setLoading(false);
        return;
      }

      // First fetch all courses
      const coursesRef = collection(db, `users/${user.uid}/courses`);
      const coursesSnapshot = await getDocs(coursesRef);
      const courses = {};
      coursesSnapshot.docs.forEach((doc) => {
        courses[doc.id] = doc.data();
      });

      // Fetch all documents
      const docsRef = collection(db, `users/${user.uid}/docs`);
      const docsSnapshot = await getDocs(
        query(docsRef, orderBy("createdAt", "desc"))
      );

      // Process the documents
      const allDocs = processDocuments(docsSnapshot, courses);

      // Split into uploaded and transcribed based on smartStructure
      const uploadedDocs = allDocs.filter((doc) => !doc.isTranscribed);
      const transcribedDocs = allDocs.filter((doc) => doc.isTranscribed);

      // Get allowed type based on creation type
      const allowedType = getDocumentPickerConfig().allowedType;

      // Filter documents by allowed type if specified
      const filteredDocs = {
        uploaded: !allowedType
          ? uploadedDocs
          : uploadedDocs.filter((doc) =>
              ALLOWED_TYPES[allowedType]?.some(
                (type) => doc.type === type || doc.contentType === type
              )
            ),
        transcribed: transcribedDocs,
      };

      setDocuments(filteredDocs);
      setLoading(false);
    } catch (err) {
      setError(t("createModal.errors.fetchDocuments"));
      console.error("Error fetching documents:", err);
      setLoading(false);
    }
  }, [processDocuments, getDocumentPickerConfig, t]);

  const createTranscription = useCallback(
    async (document) => {
      const processAudioLecture = httpsCallable(
        functions,
        "processAudioLecture"
      );
      const response = await processAudioLecture({
        docId: document.id,
        userId: auth.currentUser.uid,
        courseId: document.courseId,
      });

      if (response?.data?.success) {
        setSuccessMessage(t("createModal.success.transcriptionQueued"));
        return {
          success: true,
          courseId: response.data.courseId,
        };
      } else {
        const error = new Error(
          response?.data?.error || t("createModal.errors.unknownError")
        );

        if (response?.data?.isRateLimit) {
          error.details = {
            limitPerDay: response.data.limitPerDay,
            currentCount: response.data.currentCount,
            membershipTier: response.data.membershipTier,
            nextAvailableAt: response.data.nextAvailableAt,
            message: response.data.message,
          };
        }

        throw error;
      }
    },
    [t]
  );

  const createMindMap = useCallback(
    async (document) => {
      const generateMindMap = httpsCallable(functions, "generateMindmap");
      const response = await generateMindMap({
        docId: document.id,
      });

      if (response?.data?.success) {
        setSuccessMessage(t("createModal.success.mindMapStarted"));
        return {
          success: true,
          courseId: document.courseId,
        };
      } else {
        throw new Error(
          response?.data?.error || t("createModal.errors.mindMapFailed")
        );
      }
    },
    [t]
  );

  const createFlashcards = useCallback(
    async (document) => {
      const generateFlashcards = httpsCallable(functions, "generateFlashcards");
      const response = await generateFlashcards({
        docId: document.id,
      });

      if (response?.data?.success) {
        setSuccessMessage(t("createModal.success.flashcardsStarted"));
        return {
          success: true,
          courseId: document.courseId,
        };
      } else {
        throw new Error(
          response?.data?.error || t("createModal.errors.flashcardsFailed")
        );
      }
    },
    [t]
  );

  const createQuiz = useCallback(
    async (document) => {
      const generateQuiz = httpsCallable(functions, "generateQuiz");
      const response = await generateQuiz({
        docId: document.id,
      });

      if (response?.data?.success) {
        setSuccessMessage(t("createModal.success.quizStarted"));
        return {
          success: true,
          courseId: document.courseId,
        };
      } else {
        throw new Error(
          response?.data?.error || t("createModal.errors.quizFailed")
        );
      }
    },
    [t]
  );

  //-------------------------
  // Event Handlers
  //-------------------------
  const handleDocumentSelect = useCallback((doc) => {
    setSelectedDocument(doc);
    setError("");
  }, []);

  const handleCreateClick = useCallback(async () => {
    if (!selectedDocument) {
      setError(t("createModal.errors.selectDocument"));
      return;
    }

    try {
      setProcessing(true);
      setError("");

      let result;
      if (creationType === "lecture_transcript") {
        result = await createTranscription(selectedDocument);
      } else if (creationType === "mindmap") {
        result = await createMindMap(selectedDocument);
      } else if (creationType === "quiz") {
        result = await createQuiz(selectedDocument);
      } else if (creationType === "flashcards") {
        result = await createFlashcards(selectedDocument);
      }

      if (result?.success) {
        setShowingSuccess(true);
        setProcessing(false);

        if (
          result.courseId &&
          !location.pathname.includes(`/study-material/${result.courseId}`)
        ) {
          navigate(`/study-material/${result.courseId}`);
        }
      } else {
        throw new Error(result?.error || t("createModal.errors.unknownError"));
      }
    } catch (error) {
      console.error("Error creating content:", error);

      if (
        error.code === "functions/resource-exhausted" ||
        (error.message && error.message.includes("Rate limit exceeded"))
      ) {
        handleRateLimitError(error);
      } else {
        setError(error.message || t("createModal.errors.creationFailed"));
      }

      setProcessing(false);
    }
  }, [
    selectedDocument,
    creationType,
    createTranscription,
    createMindMap,
    createFlashcards,
    createQuiz,
    location.pathname,
    navigate,
    t,
  ]);

  const handleRateLimitError = useCallback(
    (error) => {
      let limitInfo = "";
      let retryMessage = "";
      let nextAvailableTime = null;

      if (error.details) {
        try {
          const details =
            typeof error.details === "string"
              ? JSON.parse(error.details)
              : error.details;

          if (details.limitPerDay && details.currentCount !== undefined) {
            limitInfo = t("createModal.rateLimit.usageInfo", {
              count: details.currentCount,
              limit: details.limitPerDay,
            });
          }

          if (details.nextAvailableAt) {
            nextAvailableTime = new Date(details.nextAvailableAt);
            const now = new Date();
            const minutesUntilRetry = Math.ceil(
              (nextAvailableTime - now) / 60000
            );
            retryMessage =
              details.message ||
              t("createModal.rateLimit.tryAgainMinutes", {
                count: minutesUntilRetry,
              });
          }

          if (details.membershipTier === "free") {
            setError(
              t("createModal.rateLimit.freeTierExceeded", {
                limitInfo,
                retryMessage,
              })
            );

            if (nextAvailableTime) {
              startRetryCountdown(nextAvailableTime);
            }
            return;
          }
        } catch (parseError) {
          console.error("Error parsing rate limit details:", parseError);
        }
      }

      setError(
        t("createModal.rateLimit.genericExceeded", { limitInfo, retryMessage })
      );

      if (nextAvailableTime) {
        startRetryCountdown(nextAvailableTime);
      }
    },
    [t]
  );

  const startRetryCountdown = useCallback(
    (timeToRetry) => {
      setRetryTime(timeToRetry);
      updateCountdown();
    },
    [] // Remove `updateCountdown` from deps as it causes infinite loop
  );

  const updateCountdown = useCallback(() => {
    if (!retryTime) return;

    const now = new Date();
    const timeRemaining = retryTime - now;

    if (timeRemaining <= 0) {
      setError((prev) => {
        if (
          prev &&
          prev.includes(t("createModal.rateLimit.limitReachedBase"))
        ) {
          return t("createModal.rateLimit.tryAgainNow");
        }
        return prev;
      });
      setRetryTime(null);
      return;
    }

    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);

    setError((prev) => {
      if (prev && prev.includes(t("createModal.rateLimit.limitReachedBase"))) {
        const baseMessage = prev.split(".")[0] + ".";
        return `${baseMessage} ${t("createModal.rateLimit.tryAgainCountdown", {
          minutes,
          seconds: seconds < 10 ? `0${seconds}` : seconds,
        })}`;
      }
      return prev;
    });

    setTimeout(updateCountdown, 1000);
  }, [retryTime, t]);

  // Start the countdown when retryTime is set
  useEffect(() => {
    if (retryTime) {
      updateCountdown();
    }
    // Clear interval on component unmount or when retryTime is null
    return () => clearTimeout(updateCountdown);
  }, [retryTime, updateCountdown]);

  const handleSuccessClose = useCallback(() => {
    setShowingSuccess(false);
    onClose();
  }, [onClose]);

  //-------------------------
  // Effects
  //-------------------------
  useEffect(() => {
    const isInitialRender = !isVisible && !isOpen;

    if (isOpen) {
      setIsVisible(true);
      if (fileData) {
        setSelectedDocument(fileData);
      }
      if (!showingSuccess) {
        setSuccessMessage("");
      }
    } else if (!isInitialRender) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (!showingSuccess) {
          setSelectedDocument(null);
          setError(null);
          setProcessing(false);
          setSuccessMessage("");
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, fileData, showingSuccess, isVisible]);

  useEffect(() => {
    if (isVisible && isOpen) {
      fetchDocuments();
    }
  }, [isVisible, isOpen, creationType, fetchDocuments]);

  useEffect(() => {
    if (fileData) {
      const contentType = fileData.contentType || fileData.type;
      const isAudio =
        contentType &&
        ALLOWED_TYPES.audio.some((type) => contentType.includes(type));
      const isDocument =
        contentType &&
        ALLOWED_TYPES.document.some((type) => contentType.includes(type));
      const isTranscribed =
        fileData.smartStructure?.type === "transcription" &&
        fileData.smartStructure?.status === "completed";

      setAvailableCreationTypes({
        lecture_transcript: isAudio,
        mindmap: isDocument || isTranscribed,
        flashcards: isDocument || isTranscribed,
        quiz: isDocument || isTranscribed,
      });

      if (isAudio) {
        setCreationType("lecture_transcript");
      } else if (isDocument || isTranscribed) {
        setCreationType("mindmap");
      }
    } else {
      setAvailableCreationTypes({
        lecture_transcript: true,
        mindmap: true,
        quiz: true,
        flashcards: true,
      });
      setCreationType("lecture_transcript");
    }
  }, [fileData]);

  //-------------------------
  // Computed Values
  //-------------------------
  const { showTranscribed, allowedType } = useMemo(
    () => getDocumentPickerConfig(),
    [getDocumentPickerConfig]
  );

  const currentDocs = useMemo(
    () => documents[activeTab] || [],
    [documents, activeTab]
  );

  const filteredGroups = useMemo(
    () => getGroupedAndFilteredDocuments(),
    [getGroupedAndFilteredDocuments]
  );

  const hasDocuments = useMemo(() => currentDocs.length > 0, [currentDocs]);

  const hasSearchResults = useMemo(
    () => Object.keys(filteredGroups).length > 0,
    [filteredGroups]
  );

  const availableTypesCount = useMemo(
    () => Object.values(availableCreationTypes).filter(Boolean).length,
    [availableCreationTypes]
  );

  const showDocumentPicker = useMemo(
    () => !fileData || availableTypesCount > 1,
    [fileData, availableTypesCount]
  );

  const creationTypeInfo = useMemo(() => {
    // Ensure creationType is valid before accessing CREATION_TYPE_BASE_INFO
    const typeKey = Object.keys(CREATION_TYPE_BASE_INFO).includes(creationType)
      ? creationType
      : "lecture_transcript"; // Default to a valid key if needed

    const baseInfo = CREATION_TYPE_BASE_INFO[typeKey];
    if (!baseInfo) {
      console.warn(
        `No base info found for creation type: ${typeKey}. Defaulting to lecture_transcript.`
      );
      return {
        ...CREATION_TYPE_BASE_INFO.lecture_transcript,
        name: t("createModal.creationTypes.lecture_transcript.name"),
        description: t(
          "createModal.creationTypes.lecture_transcript.description"
        ),
        tooltip: t("createModal.creationTypes.lecture_transcript.tooltip"),
      };
    }
    return {
      ...baseInfo,
      name: t(`createModal.creationTypes.${typeKey}.name`),
      description: t(`createModal.creationTypes.${typeKey}.description`),
      tooltip: t(`createModal.creationTypes.${typeKey}.tooltip`),
    };
  }, [creationType, t]);

  // Early return if modal is not visible
  if (!isVisible) return null;

  //-------------------------
  // Render Component
  //-------------------------
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      } transition-opacity duration-300`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={showingSuccess ? null : onClose}
      ></div>

      {/* Modal Content */}
      <div
        className={`relative bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto transform ${
          isOpen ? "scale-100" : "scale-95"
        } transition-transform duration-300`}
      >
        {/* Success Message */}
        {successMessage && showingSuccess && (
          <SuccessMessage
            successMessage={successMessage}
            creationType={creationType}
            onClose={handleSuccessClose}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {fileData
              ? t("createModal.header.titleFromFile", {
                  fileName: fileData?.title || fileData?.fileName,
                })
              : t("createModal.header.titleGeneric")}
          </h2>
          <button
            onClick={showingSuccess ? null : onClose}
            disabled={showingSuccess}
            className={`text-gray-500 hover:text-gray-700 focus:outline-none ${
              showingSuccess ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* File Info */}
          {fileData && <FileInfoHeader fileData={fileData} />}

          {/* Creation Type Selection */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {availableTypesCount > 1
                  ? t("createModal.creationType.selectTitle")
                  : t("createModal.creationType.availableTitle")}
              </h3>
            </div>

            {/* Horizontal Button Bar for Creation Types */}
            <div className="flex flex-wrap justify-start gap-2 pb-2 mb-4 md:flex-nowrap">
              {ORDERED_CREATION_KEYS.map((key) => {
                const typeInfo = CREATION_TYPE_BASE_INFO[key];
                // Skip rendering if the type is not defined or not available for the current fileData
                if (!typeInfo || !availableCreationTypes[key]) {
                  return null;
                }
                return (
                  <CreationTypeButton
                    key={typeInfo.key}
                    icon={typeInfo.icon}
                    title={t(`createModal.creationTypes.${typeInfo.key}.name`)}
                    isActive={creationType === typeInfo.key}
                    onClick={() => setCreationType(typeInfo.key)}
                    color={typeInfo.color}
                  />
                );
              })}
            </div>

            {/* Selected Creation Type Description */}
            <div className="p-2.5 md:p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start">
                <div
                  className={`p-1.5 rounded-full bg-${creationTypeInfo.color}-100 mr-2 md:p-2 md:mr-3`}
                >
                  {React.createElement(creationTypeInfo.icon, {
                    className: `w-4 h-4 text-${creationTypeInfo.color}-600 md:w-5 md:h-5`,
                  })}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 md:text-base">
                    {creationTypeInfo.name}
                  </h4>
                  <p className="text-xs md:text-sm text-gray-600 mt-1">
                    {creationTypeInfo.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Document Picker */}
          {showDocumentPicker && !fileData && (
            <div
              key={`${allowedType}-${showTranscribed}`}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {t("createModal.documentPicker.title")}
                  </h3>
                </div>

                <div className="w-full">
                  {/* Tabs */}
                  <DocumentTabs
                    showTranscribed={showTranscribed}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                  />

                  {/* Wrapper for loading/content with min-height */}
                  <div className="min-h-[200px]">
                    {" "}
                    {/* Adjust this value as needed */}
                    {loading ? (
                      <div className="flex items-center justify-center p-8 h-full">
                        {" "}
                        {/* Ensure spinner is centered in the min-height */}
                        <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
                      </div>
                    ) : (
                      <>
                        <DocumentSearch
                          hasDocuments={hasDocuments}
                          searchTerm={searchTerm}
                          setSearchTerm={setSearchTerm}
                        />

                        {hasDocuments ? (
                          hasSearchResults ? (
                            <DocumentList
                              filteredGroups={filteredGroups}
                              expandedCourse={expandedCourse}
                              setExpandedCourse={setExpandedCourse}
                              selectedDocument={selectedDocument}
                              handleDocumentSelect={handleDocumentSelect}
                              formatDate={formatDate}
                            />
                          ) : (
                            <NoSearchResults searchTerm={searchTerm} />
                          )
                        ) : (
                          // Pass a more specific type to EmptyState based on context
                          <EmptyState
                            type={
                              allowedType === "audio"
                                ? "upload"
                                : "noMatchingFiles"
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 pb-4">
            <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 gap-3">
          <button
            onClick={onClose}
            disabled={processing || showingSuccess}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {t("createModal.buttons.cancel")}
          </button>
          <button
            onClick={handleCreateClick}
            disabled={
              !selectedDocument ||
              processing ||
              showingSuccess ||
              retryTime !== null
            }
            className={`px-4 py-2 text-white rounded-lg transition-all duration-200 flex items-center gap-2 ${
              !selectedDocument ||
              processing ||
              showingSuccess ||
              retryTime !== null
                ? "bg-stone-500 cursor-not-allowed"
                : "bg-stone-800 hover:bg-stone-900"
            }`}
          >
            {processing && <Loader2 className="w-4 h-4 animate-spin" />}
            {processing
              ? t("createModal.buttons.processing")
              : t(`createModal.buttons.create.${creationType}`)}
          </button>
        </div>
      </div>
    </div>
  );
};

CreateModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  fileData: PropTypes.object,
};

export default CreateModal;

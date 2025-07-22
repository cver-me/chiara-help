import { useState, useEffect, useMemo } from "react";
import { Upload as UploadIcon, X, AlertCircle, Languages } from "lucide-react";
import { uploadBytesResumable, ref } from "firebase/storage";
import { auth, storage, db } from "../utils/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const Upload = ({ isOpen, onClose, onFileUpload }) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseInput, setCourseInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [existingCourses, setExistingCourses] = useState([]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTask, setUploadTask] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [language, setLanguage] = useState("");

  // Available languages
  const languages = [
    { code: "it", name: "Italian" },
    { code: "en", name: "English" },
  ];

  // Handle animation timing for the modal
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300); // Match this with the transition duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Load existing course names
  useEffect(() => {
    const loadCourses = async () => {
      if (!auth.currentUser) return;

      // Get courses directly from the courses collection
      const coursesRef = collection(
        db,
        `users/${auth.currentUser.uid}/courses`
      );
      const coursesSnapshot = await getDocs(coursesRef);
      const courses = coursesSnapshot.docs.map((doc) => doc.data().name);
      setExistingCourses(courses.sort());
    };

    if (isOpen) {
      loadCourses();
    }
  }, [isOpen]);

  // Filter suggestions based on input
  const filteredCourses = useMemo(() => {
    if (!courseInput) return existingCourses;
    const inputLower = courseInput.toLowerCase();
    return existingCourses.filter((course) =>
      course.toLowerCase().includes(inputLower)
    );
  }, [courseInput, existingCourses]);

  // Function to find exact course match (case-insensitive)
  const findExactCourseMatch = (inputName) => {
    return existingCourses.find(
      (course) => course.toLowerCase() === inputName.toLowerCase()
    );
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".course-input-container")) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup on unmount or modal close
  useEffect(() => {
    return () => {
      if (uploadTask) {
        uploadTask.cancel();
      }
    };
  }, [uploadTask]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setCourseName("");
      setCourseInput("");
      setFile(null);
      setError("");
      setLoading(false);
      setUploadProgress(0);
      setUploadTask(null);
      setLanguage("");
    }
  }, [isOpen]);

  const allowedTypes = [
    "text/plain",
    "application/pdf",
    "text/markdown",
    "audio/mpeg", // .mp3
    "audio/mp4", // .m4a
    "audio/x-m4a", // Alternative MIME type for .m4a
    "audio/wav", // .wav
    "audio/x-wav", // Alternative MIME type for .wav
    "audio/ogg", // .ogg
    "audio/x-ms-wma", // .wma
    "audio/aac", // .aac
    "audio/flac", // .flac
  ];

  const maxSize = 400 * 1024 * 1024; // 400MB in bytes

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    console.log("File type:", selectedFile.type);

    if (!allowedTypes.includes(selectedFile.type)) {
      setError(t("upload.errors.fileTypeNotAllowed"));
      return;
    }

    if (selectedFile.size > maxSize) {
      setError(t("upload.errors.fileSizeExceeded"));
      return;
    }

    setError("");
    setFile(selectedFile);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;

    if (!allowedTypes.includes(droppedFile.type)) {
      setError(t("upload.errors.fileTypeNotAllowed"));
      return;
    }

    if (droppedFile.size > maxSize) {
      setError(t("upload.errors.fileSizeExceeded"));
      return;
    }

    setError("");
    setFile(droppedFile);
  };

  const handleCancel = () => {
    if (uploadTask) {
      uploadTask.cancel();
      setUploadTask(null);
    }
    onClose();
  };

  // Import our error handling utility instead of implementing it here
  const getErrorMessage = (error) => {
    // Dynamically import the error handling utility
    return import("../utils/errorHandling.js")
      .then(({ getErrorMessage }) => {
        return getErrorMessage(error);
      })
      .catch(() => {
        // Fallback implementation if import fails
        switch (error.code) {
          case "storage/unauthorized":
            return t("upload.errors.unauthorized");
          case "storage/canceled":
            return t("upload.errors.canceled");
          case "storage/retry-limit-exceeded":
            return t("upload.errors.retryLimitExceeded");
          case "storage/invalid-checksum":
            return t("upload.errors.invalidChecksum");
          case "storage/unknown":
            return navigator.onLine
              ? t("upload.errors.uploadFailed")
              : t("upload.errors.noInternet");
          default:
            return t("upload.errors.defaultError");
        }
      });
  };

  // Function to get a free color
  const getAvailableColor = async () => {
    const COURSE_COLORS = [
      "#E6B0B0", // Dusty Rose
      "#90CAF9", // Sky Blue
      "#A5D6A7", // Sage Green
      "#FFB74D", // Sand Orange
      "#B39DDB", // Lavender
      "#81C784", // Forest Green
      "#F48FB1", // Salmon Pink
      "#4FC3F7", // Ocean Blue
      "#FFF176", // Lemon Yellow
      "#9575CD", // Purple
      "#FF8A65", // Coral
      "#4DB6AC", // Teal
      "#DCE775", // Lime
      "#7986CB", // Indigo
      "#FFB6C1", // Light Pink
      "#AED581", // Olive
      "#64B5F6", // Royal Blue
      "#FFD54F", // Golden
      "#BA68C8", // Violet
      "#81D4FA", // Ice Blue
    ];

    const user = auth.currentUser;
    if (!user) throw new Error(t("upload.errors.notAuthenticated"));

    // Get all existing courses
    const coursesRef = collection(db, `users/${user.uid}/courses`);
    const coursesSnapshot = await getDocs(coursesRef);

    // Get all used colors
    const usedColors = new Set();
    coursesSnapshot.forEach((doc) => {
      const color = doc.data().color;
      if (color) usedColors.add(color);
    });

    // Find first available color
    const availableColor = COURSE_COLORS.find(
      (color) => !usedColors.has(color)
    );

    // If all colors are used, return the first one
    return availableColor || COURSE_COLORS[0];
  };

  // Function to get or create course
  const getOrCreateCourse = async (courseName) => {
    const user = auth.currentUser;
    if (!user) throw new Error(t("upload.errors.notAuthenticated"));

    // Check if course exists (case-insensitive)
    const coursesRef = collection(db, `users/${user.uid}/courses`);
    const querySnapshot = await getDocs(coursesRef);

    // Find case-insensitive match
    const existingCourse = querySnapshot.docs.find(
      (doc) => doc.data().name.toLowerCase() === courseName.toLowerCase()
    );

    if (existingCourse) {
      // Course exists, return its ID
      return existingCourse.id;
    }

    // Get an available color for the new course
    const color = await getAvailableColor();

    // Course doesn't exist, create it
    const newCourseRef = await addDoc(coursesRef, {
      name: courseName,
      color,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return newCourseRef.id;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Submit handler - Language value:", language);
    console.log("Submit handler - All form values:", {
      courseName,
      file,
      language,
    });
    if (!courseName.trim() || !file || !language) {
      setError(t("upload.errors.fillAllFields"));
      return;
    }

    if (!navigator.onLine) {
      setError(t("upload.errors.noInternet"));
      return;
    }

    setLoading(true);
    setError("");
    setUploadProgress(0);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error(t("upload.errors.notAuthenticated"));

      // Check for existing course with case-insensitive match
      const exactMatch = findExactCourseMatch(courseName.trim());
      const finalCourseName = exactMatch || courseName.trim();

      // Get or create course with the matched name
      const courseId = await getOrCreateCourse(finalCourseName);

      // Generate unique ID for the document
      const docId = crypto.randomUUID();

      const storagePath = `users/${user.uid}/docs/${docId}/${file.name}`;

      // Upload file to Firebase Storage
      const storageRef = ref(storage, storagePath);
      const metadata = {
        customMetadata: {
          userId: user.uid,
          courseId: courseId,
          language: language,
          docId: docId,
        },
      };
      console.log("Uploading file with metadata:", metadata);
      const task = uploadBytesResumable(storageRef, file, metadata);
      setUploadTask(task);

      // Monitor upload progress
      task.on(
        "state_changed",
        // Progress handler
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        // Error handler
        (error) => {
          console.error("Upload error:", error);
          setError(getErrorMessage(error));
          setLoading(false);
          setUploadTask(null);
        },
        // Completion handler
        () => {
          setLoading(false);
          setUploadTask(null);
          // Trigger parent's onFileUpload callback (if provided) to refresh course data
          if (typeof onFileUpload === "function") {
            console.log(
              "Calling onFileUpload with file and courseId. Language is:",
              language
            );
            // Attach the language to the file object
            const fileWithLanguage = Object.assign(file, { language });
            onFileUpload(fileWithLanguage, courseId);
          }
          setTimeout(() => {
            onClose();
          }, 500);
        }
      );
    } catch (err) {
      console.log("Error occurred. Last known language value:", language);
      console.error("Setup error:", err);
      setError(getErrorMessage(err));
      setLoading(false);
      setUploadTask(null);
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      } transition-opacity duration-300`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>

      {/* Modal Content */}
      <div
        className={`relative bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-auto transform ${
          isOpen ? "scale-100" : "scale-95"
        } transition-transform duration-300`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {t("upload.title")}
          </h2>
          <button
            onClick={handleCancel}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={loading && uploadProgress > 0 && uploadProgress < 100}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="course-input-container relative space-y-4">
              <div>
                <label
                  htmlFor="courseName"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  {t("upload.courseName")}
                </label>
                <input
                  type="search"
                  id="courseName"
                  name="searchCourse"
                  value={courseInput}
                  onChange={(e) => {
                    setCourseInput(e.target.value);
                    setCourseName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  autoComplete="off"
                  data-form-type="other"
                  data-lpignore="true"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400 hover:border-gray-300 transition-all"
                  placeholder={t("upload.courseNamePlaceholder")}
                />
                {showSuggestions && filteredCourses.length > 0 && (
                  <div className="absolute left-0 right-0 z-50">
                    <ul className="mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCourses.map((course) => (
                        <li
                          key={course}
                          className="py-2 px-4 hover:bg-gray-100 cursor-pointer"
                          onClick={() => {
                            setCourseName(course);
                            setCourseInput(course);
                            setShowSuggestions(false);
                          }}
                        >
                          {course}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {t("upload.courseNameHelp")}
                </p>
              </div>

              <div>
                <label
                  htmlFor="language"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  {t("upload.documentLanguage")}
                </label>
                <div className="relative">
                  <Languages className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <select
                    id="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 border border-gray-200 rounded-lg shadow-sm 
                      focus:outline-none focus:ring-2 focus:ring-stone-200 focus:border-stone-400 
                      cursor-pointer hover:border-gray-300 transition-all appearance-none"
                    required
                  >
                    <option value="">{t("upload.selectLanguage")}</option>
                    {languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className={`relative border-2 border-dashed rounded-lg p-6 ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-300"
                }`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept={allowedTypes.join(",")}
                />
                <div className="text-center">
                  <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600">
                    {isDragging
                      ? t("upload.dropFileHere")
                      : t("upload.dragAndDropFile")}
                  </p>
                  <div className="mt-1 text-xs text-gray-500">
                    {t("upload.supportedFiles")}
                  </div>
                </div>
                {file && (
                  <div className="mt-4 flex items-center justify-between bg-gray-50 p-2 rounded">
                    <span className="text-sm text-gray-600 truncate">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {loading && (
                <div className="space-y-2">
                  <div className="h-2 bg-gray-200 rounded">
                    <div
                      className="h-full bg-stone-600 rounded transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-600 text-center">
                    {uploadProgress < 100
                      ? t("upload.uploading", {
                          progress: Math.round(uploadProgress),
                        })
                      : t("upload.processing")}
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start space-x-2 text-red-500">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading && uploadProgress > 0 && uploadProgress < 100}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("upload.cancel")}
              </button>
              <button
                type="submit"
                disabled={loading || !file || !courseName.trim() || !language}
                className="flex-1 bg-stone-800 text-white py-2 px-4 rounded-lg hover:bg-stone-900 
                  disabled:bg-stone-500 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? t("upload.uploading.button") : t("upload.submit")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

Upload.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onFileUpload: PropTypes.func, // Optional callback after upload completes
};

export default Upload;

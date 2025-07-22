import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  X,
  Download,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  FileIcon,
  AlertCircle,
  Info,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import toast from "../components/Toast.jsx";

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

const AudioPlayer = ({ url, onError }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  const formatTime = (time) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    setDuration(audioRef.current.duration);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    const time = e.target.value;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleSkip = (direction) => {
    const newTime = currentTime + direction;
    audioRef.current.currentTime = Math.max(0, Math.min(newTime, duration));
  };

  return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="w-full max-w-2xl p-6">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">
              Audio Player
            </div>
            <div className="text-xs text-gray-500">{formatTime(duration)}</div>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          <audio
            ref={audioRef}
            src={url}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={onError}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="relative group">
              <div className="absolute -top-6 left-0 w-full flex justify-between text-xs text-gray-500">
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(duration - currentTime)}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full relative">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <div
                  className="absolute h-4 w-4 -top-1 bg-white rounded-full shadow-md border border-primary transition-all"
                  style={{
                    left: `calc(${(currentTime / duration) * 100}% - 8px)`,
                    display: duration ? "block" : "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-8">
            <button
              onClick={() => handleSkip(-10)}
              className="p-4 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900 flex flex-col items-center justify-center min-w-[48px]"
              title="Skip backward 10 seconds"
            >
              <RotateCcw className="w-5 h-5" />
              <span className="text-[10px] text-gray-500 mt-1 font-medium">
                -10s
              </span>
            </button>

            <button
              onClick={handlePlayPause}
              className="p-4 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900 relative group"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={() => handleSkip(10)}
              className="p-4 hover:bg-gray-100 rounded-xl transition-colors text-gray-600 hover:text-gray-900 flex flex-col items-center justify-center min-w-[48px]"
              title="Skip forward 10 seconds"
            >
              <RotateCw className="w-5 h-5" />
              <span className="text-[10px] text-gray-500 mt-1 font-medium">
                +10s
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

AudioPlayer.propTypes = {
  url: PropTypes.string.isRequired,
  onError: PropTypes.func.isRequired,
};

const PDFViewer = ({ url, onError }) => {
  const [numPages, setNumPages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const viewerRef = useRef(null);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  useEffect(() => {
    function updateContainerWidth() {
      if (viewerRef.current) {
        setContainerWidth(viewerRef.current.getBoundingClientRect().width);
      }
    }
    updateContainerWidth();
    window.addEventListener("resize", updateContainerWidth);
    return () => window.removeEventListener("resize", updateContainerWidth);
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-red-500 text-center">Failed to load PDF</p>
        <p className="text-sm text-gray-500 mt-2 text-center">
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto bg-gray-50 p-4" ref={viewerRef}>
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => {
            console.error("Error loading PDF:", error);
            setError(error);
            setLoading(false);
            if (onError) {
              onError(error);
            }
          }}
          loading={null}
          className=""
        >
          {numPages &&
            Array.from({ length: numPages }, (_, index) => (
              <div key={`page_wrapper_${index + 1}`} className="mb-4">
                <Page
                  key={`page_${index + 1}`}
                  pageNumber={index + 1}
                  width={containerWidth ? containerWidth - 32 : 600}
                  className="shadow-lg bg-white"
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center justify-center p-4">
                      <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                      <p className="text-sm text-red-500">
                        Failed to load page
                      </p>
                    </div>
                  }
                />
              </div>
            ))}
        </Document>
      </div>
    </div>
  );
};

PDFViewer.propTypes = {
  url: PropTypes.string.isRequired,
  onError: PropTypes.func,
};

const FilePreview = ({ fileDocument, onClose }) => {
  const [error, setError] = useState(null);
  const [content, setContent] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  // eslint-disable-next-line no-unused-vars
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const infoButtonRef = useRef(null);

  // Add a ref for the scrollable content container.
  const contentRef = useRef(null);

  // Whenever the fileDocument changes, reset the scroll position to the top.
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [fileDocument]);

  // Function to truncate filename for mobile
  const getTruncatedFileName = (fileName) => {
    const isMobile = window.innerWidth < 768; // md breakpoint in Tailwind
    if (!isMobile) return fileName;

    const nameParts = fileName.split(".");
    const ext = nameParts.pop();
    const name = nameParts.join(".");

    if (name.length <= 13) return fileName;
    return `${name.slice(0, 30)}...${ext ? `.${ext}` : ""}`;
  };

  // Function to format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return "N/A";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Function to format date
  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";

    const dateOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false, // Use 24-hour format
    };

    try {
      // Handle Firestore Timestamp object
      if (timestamp?.toDate) {
        return timestamp.toDate().toLocaleDateString("en-US", dateOptions);
      }

      // Handle JavaScript Date object or string
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-US", dateOptions);
      }

      return "N/A";
    } catch (error) {
      console.error("Error formatting date:", error);
      return "N/A";
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkdownDownload = async () => {
    try {
      const storage = getStorage();
      const fileRef = ref(storage, fileDocument.storagePath);
      const downloadURL = await getDownloadURL(fileRef);

      const response = await fetch(downloadURL);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = window.document.createElement("a");
      link.href = url;
      link.download = fileDocument.fileName || fileDocument.originalFilename;
      link.style.display = "none";

      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setShowDropdown(false);
      toast.success(`"${fileDocument.fileName}" downloaded`);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download file: " + error.message);
    }
  };

  // Close info dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        infoButtonRef.current &&
        !infoButtonRef.current.contains(event.target)
      ) {
        setShowInfo(false);
      }
    };

    if (typeof window !== "undefined") {
      window.document.addEventListener("mousedown", handleClickOutside);
      return () =>
        window.document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (
      fileDocument.fileType === "text/markdown" ||
      fileDocument.fileType === "text/plain"
    ) {
      fetch(fileDocument.url)
        .then((response) => {
          return response.text();
        })
        .then((text) => {
          setContent(text);
          setError(null);
        })
        .catch((err) => {
          console.error(
            `FilePreview: Error fetching ${fileDocument.fileType}:`,
            err
          );
          setError(
            `Failed to load ${fileDocument.fileType === "text/plain" ? "text" : "markdown"} content`
          );
        });
    }
  }, [fileDocument]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <p className="text-red-500 text-center">Error</p>
        <p className="text-sm text-gray-500 mt-2 text-center">{error}</p>
      </div>
    );
  }

  const renderDownloadButton = () => {
    if (fileDocument.fileType === "text/markdown") {
      return (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleMarkdownDownload}
            className="inline-flex items-center p-2 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={handleMarkdownDownload}
        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="Download file"
      >
        <Download className="w-5 h-5 text-gray-500" />
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-medium text-gray-900 px-2 truncate">
          {getTruncatedFileName(fileDocument.fileName)}
        </h2>
        <div className="flex items-center space-x-2 shrink-0">
          <div className="relative" ref={infoButtonRef}>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="File information"
            >
              <Info className="w-5 h-5 text-gray-500" />
            </button>

            {/* File Info Dropdown */}
            {showInfo && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 space-y-3">
                  <h3 className="font-medium text-gray-900 border-b pb-2">
                    File Details
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Type:</span>
                      <span className="text-gray-900">
                        {fileDocument.type || fileDocument.fileType || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Size:</span>
                      <span className="text-gray-900">
                        {formatFileSize(fileDocument.size)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Language:</span>
                      <span className="text-gray-900">
                        {fileDocument.language || "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Uploaded:</span>
                      <span className="text-gray-900">
                        {formatDate(fileDocument.uploadDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Course:</span>
                      <span className="text-gray-900 flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: fileDocument.courseColor }}
                        />
                        {fileDocument.courseName || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {renderDownloadButton()}
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            title="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={contentRef}
          className={`h-full overflow-y-auto overscroll-contain ${
            fileDocument.fileType.startsWith("audio/")
              ? ""
              : `bg-[#FDFBF7] [background-image:repeating-linear-gradient(0deg,rgba(0,0,0,0.01)_0px,transparent_1px,transparent_20px),repeating-linear-gradient(90deg,rgba(0,0,0,0.01)_0px,transparent_1px,transparent_20px),radial-gradient(circle_at_0_0,rgba(0,0,0,0.01)_1px,transparent_1px),radial-gradient(circle_at_100%_100%,rgba(0,0,0,0.01)_1px,transparent_1px)`
          }`}
        >
          {fileDocument.fileType === "text/markdown" ? (
            <div className="max-w-3xl mx-auto px-8 py-8">
              {content === null ? (
                <div className="animate-pulse">Loading...</div>
              ) : (
                <div className="prose prose-sm sm:prose lg:prose-lg">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          ) : fileDocument.fileType === "text/plain" ? (
            <div className="max-w-3xl mx-auto px-8 py-6">
              {content === null ? (
                <div className="animate-pulse">Loading...</div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm">
                  {content}
                </pre>
              )}
            </div>
          ) : fileDocument.fileType === "application/pdf" ? (
            <div className="h-full flex flex-col">
              <PDFViewer
                url={fileDocument.url}
                onError={(error) => {
                  console.error("FilePreview: PDF error:", error);
                  setError("Failed to load PDF");
                }}
              />
            </div>
          ) : fileDocument.fileType.startsWith("audio/") ? (
            <div className="h-full flex items-start justify-center pt-32">
              <div className="w-full max-w-2xl">
                <AudioPlayer
                  key={fileDocument.id}
                  url={fileDocument.url}
                  onError={(error) => {
                    console.error("FilePreview: Audio error:", error);
                    setError("Failed to load audio");
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-6">
              <FileIcon className="w-16 h-16 text-gray-400 mb-4" />
              <p className="text-gray-500">
                Preview not available for this file type.
              </p>
              <button
                onClick={handleMarkdownDownload}
                className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

FilePreview.propTypes = {
  fileDocument: PropTypes.shape({
    id: PropTypes.string.isRequired,
    fileName: PropTypes.string.isRequired,
    fileType: PropTypes.string.isRequired,
    url: PropTypes.string,
    storagePath: PropTypes.string,
    originalFilename: PropTypes.string,
    courseName: PropTypes.string,
    courseColor: PropTypes.string,
    course: PropTypes.shape({
      name: PropTypes.string,
    }),
    type: PropTypes.string,
    size: PropTypes.number,
    language: PropTypes.string,
    uploadDate: PropTypes.shape({
      seconds: PropTypes.number,
      nanoseconds: PropTypes.number,
    }),
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default FilePreview;

import { motion, AnimatePresence } from "framer-motion";
import PropTypes from "prop-types";
import {
  X,
  FileText,
  FileAudio,
  Book,
  File,
  Loader2,
  Info,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

// Helper function to get file icon
const getFileIcon = (contentType) => {
  if (!contentType) return File;
  if (contentType.startsWith("audio/")) return FileAudio;
  if (contentType === "application/pdf") return FileText;
  if (contentType === "text/markdown") return Book;
  return File;
};

const MarkdownContent = ({ content, onReady }) => {
  useEffect(() => {
    if (!content || content.trim() === "") {
      return;
    }
    // Wait an extra 200ms (adjust as needed) to cover heavy rendering of markdown (e.g., LaTeX)
    const timer = setTimeout(() => {
      onReady();
    }, 200);

    return () => clearTimeout(timer);
  }, [content, onReady]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
    >
      {content}
    </ReactMarkdown>
  );
};

MarkdownContent.propTypes = {
  content: PropTypes.string.isRequired,
  onReady: PropTypes.func.isRequired,
};

const StudyMaterialPreview = ({ fileDocument, onClose, onDownload }) => {
  const { t } = useTranslation();
  // Explicitly initialize isLoading to true for markdown files if needed
  const initialLoading =
    fileDocument?.loading ||
    (fileDocument?.contentType === "text/markdown" && !fileDocument.markdown) ||
    false;
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setError] = useState(null);
  const [showInfoDropdown, setShowInfoDropdown] = useState(false);
  const FileIcon = fileDocument ? getFileIcon(fileDocument.contentType) : File;

  // Function to format size using translation
  const formatSize = (bytes) => {
    if (!bytes) return t("studyMaterialPreview.unknownSize");
    const size = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
    if (isNaN(size)) return t("studyMaterialPreview.unknownSize");

    const units = ["B", "KB", "MB", "GB"];
    let formattedSize = size;
    let unitIndex = 0;
    while (formattedSize >= 1024 && unitIndex < units.length - 1) {
      formattedSize /= 1024;
      unitIndex++;
    }
    return `${formattedSize.toFixed(1)} ${units[unitIndex]}`;
  };

  // Handler to reset states when closing
  const handleClose = () => {
    setShowInfoDropdown(false);
    onClose();
  };

  useEffect(() => {
    if (
      fileDocument?.contentType === "text/markdown" &&
      !fileDocument.markdown
    ) {
      setIsLoading(true);
    }
  }, [fileDocument]);

  if (!fileDocument) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="preview-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-y-0 inset-x-0 md:left-auto md:right-0 md:w-1/2 bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className="flex flex-col border-b border-gray-200">
          <div className="flex items-center p-4 gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2 bg-gray-50 rounded-lg shrink-0">
                <FileIcon className="w-5 h-5 text-gray-500" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 className="text-xl font-semibold text-gray-900">
                  <span className="md:hidden block truncate">
                    {fileDocument.title || fileDocument.fileName}
                  </span>
                  <span className="hidden md:block">
                    {fileDocument.title || fileDocument.fileName}
                  </span>
                </h2>
                <p className="hidden md:block text-sm text-gray-500">
                  {formatSize(fileDocument.size)} • {fileDocument.contentType}
                  {fileDocument.version > 1 &&
                    ` ${t("studyMaterialPreview.versionInfo", { version: fileDocument.version })}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <button
                  onClick={() => setShowInfoDropdown(!showInfoDropdown)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title={t("studyMaterialPreview.fileInformation")}
                >
                  <Info className="w-5 h-5 text-gray-500" />
                </button>
                {showInfoDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 divide-y divide-gray-100">
                    <div className="px-4 py-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          {t("studyMaterialPreview.fileNameLabel")}
                        </p>
                        <p className="text-sm font-medium truncate">
                          {fileDocument.fileName}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          {t("studyMaterialPreview.typeLabel")}
                        </p>
                        <p className="text-sm font-medium">
                          {fileDocument.contentType}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          {t("studyMaterialPreview.sizeLabel")}
                        </p>
                        <p className="text-sm font-medium">
                          {formatSize(fileDocument.size)}
                        </p>
                      </div>
                    </div>
                    {fileDocument.createdAt && (
                      <div className="px-4 py-3">
                        <div>
                          <p className="text-xs text-gray-500">
                            {t("studyMaterialPreview.createdLabel")}
                          </p>
                          <p className="text-sm font-medium">
                            {new Date(
                              fileDocument.createdAt.seconds * 1000
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="px-4 py-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          {t("studyMaterialPreview.createdByLabel")}
                        </p>
                        <p className="text-sm font-medium">
                          {fileDocument.userName ||
                            t("studyMaterialPreview.createdByUser")}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Always show Download button if onDownload is provided */}
              {onDownload && (
                <button
                  onClick={() => onDownload(fileDocument)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title={t("studyMaterialPreview.downloadFileTooltip")}
                >
                  <Download className="w-5 h-5 text-gray-500" />
                </button>
              )}

              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title={t("studyMaterialPreview.closePreviewTooltip")}
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center text-red-500">
                <p className="font-medium">
                  {t("studyMaterialPreview.error.failedToLoadFile")}
                </p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {fileDocument.contentType === "text/markdown" ? (
            <div className="p-6 prose prose-stone max-w-none">
              <MarkdownContent
                content={fileDocument.markdown || ""}
                onReady={() => {
                  setIsLoading(false);
                }}
              />
            </div>
          ) : fileDocument.type === "doc" &&
            fileDocument.contentType === "text/plain" &&
            fileDocument.text ? (
            <div className="p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-700">
                {fileDocument.text}
              </pre>
            </div>
          ) : fileDocument.contentType.startsWith("audio/") ? (
            <div className="p-6 flex justify-center">
              <audio
                controls
                className="w-full max-w-2xl"
                src={fileDocument.url}
                onLoadStart={() => setIsLoading(true)}
                onLoadedData={() => setIsLoading(false)}
                onError={() => {
                  setError(t("studyMaterialPreview.error.failedToLoadAudio"));
                  setIsLoading(false);
                }}
              >
                {t("studyMaterialPreview.audioNotSupported")}
              </audio>
            </div>
          ) : (
            <iframe
              src={fileDocument.url}
              className="w-full h-full border-0"
              title={t("studyMaterialPreview.filePreviewTitle")}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setError(t("studyMaterialPreview.error.failedToLoadPreview"));
                setIsLoading(false);
              }}
            />
          )}
        </div>
      </motion.div>

      {/* Backdrop */}
      <motion.div
        key="preview-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 bg-black/20 z-40 md:block"
      />
    </AnimatePresence>
  );
};

StudyMaterialPreview.propTypes = {
  fileDocument: PropTypes.shape({
    id: PropTypes.string,
    docId: PropTypes.string,
    title: PropTypes.string,
    fileName: PropTypes.string,
    contentType: PropTypes.string.isRequired,
    url: PropTypes.string,
    docType: PropTypes.string,
    type: PropTypes.oneOf(["upload", "doc"]),
    size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    createdAt: PropTypes.shape({
      seconds: PropTypes.number,
      nanoseconds: PropTypes.number,
    }),
    version: PropTypes.number,
    loading: PropTypes.bool,
    markdown: PropTypes.string,
    text: PropTypes.string,
    parsedMindMap: PropTypes.object,
    userName: PropTypes.string,
    smartStructure: PropTypes.shape({
      status: PropTypes.string,
      cleanMarkdownPath: PropTypes.string,
      processedAt: PropTypes.object,
      fileSize: PropTypes.number,
    }),
  }),
  onClose: PropTypes.func.isRequired,
  onDownload: PropTypes.func,
};

export default StudyMaterialPreview;

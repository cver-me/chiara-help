import { useState, memo } from "react";
import { ArrowLeft, Copy, Trash2, Clock, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import PropTypes from "prop-types";
import "katex/dist/katex.min.css";
import { useTranslation } from "react-i18next";
import LectureTranscriptPdfGenerator from "../StudyMaterial/LectureTranscriptPdfGenerator";

const ArtifactDetail = ({ artifact, onBack, onDelete }) => {
  const { t, i18n } = useTranslation();
  // Format timestamp to readable format
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  // Copy artifact content to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
  };

  // PDF generation states
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Handle PDF download
  const handleDownloadPdf = () => {
    setIsPdfGenerating(true);
  };

  // Handle PDF generation completion
  const handlePdfComplete = () => {
    setIsPdfGenerating(false);
  };

  // Handle PDF generation error
  const handlePdfError = (error) => {
    console.error("PDF generation failed:", error);
    setIsPdfGenerating(false);
  };

  // Add state for text expansion
  const [isExpanded, setIsExpanded] = useState(false);
  const MAX_CHARS = 100; // Maximum characters to show initially

  // Function to handle text display with truncation
  const renderSourceText = (text) => {
    if (!text) return null;

    if (text.length <= MAX_CHARS || isExpanded) {
      return <p className="text-stone-600">{text}</p>;
    }

    return (
      <>
        <p className="text-stone-600">{text.substring(0, MAX_CHARS)}...</p>
        <button
          onClick={() => setIsExpanded(true)}
          className="mt-2 text-stone-600 hover:text-stone-800 text-sm font-medium"
        >
          {t("artifactDetail.showMore")}
        </button>
      </>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Fixed header section */}
      <div className="flex-none">
        <div className="flex items-center mb-4">
          <button
            onClick={onBack}
            className="mr-2 p-1 hover:bg-stone-100 rounded-full transition-colors duration-200 ease-in-out text-stone-500"
            aria-label={t("artifactDetail.backToList")}
          >
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-lg font-medium capitalize flex-1 text-stone-800">
            {t(`artifactDetail.type.${artifact.type}`, {
              defaultValue: artifact.type,
            })}
          </h3>
          <div className="flex">
            <button
              onClick={handleCopy}
              className="p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-full mr-1 transition-colors duration-200 ease-in-out"
              aria-label={t("artifactDetail.copyContent")}
            >
              <Copy size={18} />
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isPdfGenerating}
              className={`p-2 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-full mr-1 transition-colors duration-200 ease-in-out ${
                isPdfGenerating ? "opacity-50 cursor-not-allowed" : ""
              }`}
              aria-label={t("artifactDetail.downloadPdf")}
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => onDelete(artifact.id)}
              className="p-2 text-stone-500 hover:text-red-500 hover:bg-stone-100 rounded-full transition-colors duration-200 ease-in-out"
              aria-label={t("artifactDetail.deleteArtifact")}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center text-sm text-stone-500 mb-4">
          <Clock size={14} className="mr-1" />
          <span>{formatTime(artifact.timestamp)}</span>
          <span className="mx-2">•</span>
          <span>
            {artifact.sourceText
              ? t("artifactDetail.fromSelectedText")
              : t("artifactDetail.fromEntireDocument")}
          </span>
        </div>

        {artifact.sourceText && (
          <div className="bg-stone-50 p-3 rounded-md mb-4 text-sm border-l-4 border-stone-300">
            <h4 className="font-medium mb-1 text-stone-700">
              {t("artifactDetail.selectedText")}
            </h4>
            {renderSourceText(artifact.sourceText)}
            {isExpanded && (
              <button
                onClick={() => setIsExpanded(false)}
                className="mt-2 text-stone-600 hover:text-stone-800 text-sm font-medium"
              >
                {t("artifactDetail.showLess")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content section */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="prose prose-stone prose-sm md:prose-base max-w-none">
          {/* Wrap in try-catch to handle any markdown parsing errors */}
          {(() => {
            try {
              return (
                <>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {artifact.content || ""}
                  </ReactMarkdown>
                  {/* Spacer div to ensure content is scrollable to the very end */}
                  <div className="h-24"></div>
                </>
              );
            } catch (error) {
              console.error("Error rendering markdown:", error);
              // Fallback to plain text if markdown parsing fails
              return (
                <div className="text-stone-800">
                  {artifact.content.split("\n").map((paragraph, index) => (
                    <p key={index} className="mb-4">
                      {paragraph}
                    </p>
                  ))}
                  {/* Spacer div to ensure content is scrollable to the very end */}
                  <div className="h-24"></div>
                </div>
              );
            }
          })()}
        </div>
      </div>

      {/* PDF Generator Component */}
      {isPdfGenerating && (
        <LectureTranscriptPdfGenerator
          markdown={artifact.content}
          fileName={`${t(`artifactDetail.type.${artifact.type}`, { defaultValue: artifact.type })}-${new Date(artifact.timestamp).toISOString().split("T")[0]}`}
          onComplete={handlePdfComplete}
          onError={handlePdfError}
          courseName={t(`artifactDetail.type.${artifact.type}`, {
            defaultValue: artifact.type,
          })}
        />
      )}
    </div>
  );
};

// PropTypes validation
ArtifactDetail.propTypes = {
  artifact: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    timestamp: PropTypes.number.isRequired,
    sourceText: PropTypes.string,
  }).isRequired,
  onBack: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};

// Memoize component to prevent unnecessary re-renders
export default memo(ArtifactDetail, (prevProps, nextProps) => {
  // Only re-render if the artifact or callback functions change
  return (
    prevProps.artifact.id === nextProps.artifact.id &&
    prevProps.artifact.content === nextProps.artifact.content &&
    prevProps.artifact.timestamp === nextProps.artifact.timestamp &&
    prevProps.onBack === nextProps.onBack &&
    prevProps.onDelete === nextProps.onDelete
  );
});

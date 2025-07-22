import { useState, memo } from "react";
import { Trash2, Clock, FileText, BookOpen, ScrollText } from "lucide-react";
import ArtifactGenerationControls from "./ArtifactGenerationControls";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const ArtifactsList = ({
  artifacts,
  onSelectArtifact,
  onCreateArtifact,
  onDeleteArtifact,
  selectedText,
  documentId,
  userId,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const { t, i18n } = useTranslation();

  // Format timestamp to readable format
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  // Get appropriate icon for artifact type
  const getArtifactIcon = (type) => {
    switch (type) {
      case "summary":
        return <ScrollText size={18} className="text-stone-600" />;
      case "explain":
        return <BookOpen size={18} className="text-stone-600" />;
      default:
        return <FileText size={18} className="text-stone-600" />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <ArtifactGenerationControls
          selectedText={selectedText}
          documentId={documentId}
          userId={userId}
          onCreateArtifact={(newArtifact) => {
            onCreateArtifact(newArtifact);
            setIsCreating(false);
          }}
          isCreating={isCreating}
          setIsCreating={setIsCreating}
          setProcessingMode={() => {}} // Dummy function that does nothing, just to satisfy the prop
        />
      </div>

      {artifacts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center flex-col text-center p-8 text-stone-500">
          <FileText size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">
            {t("artifactsList.noArtifacts")}
          </h3>
          <p className="mb-4">{t("artifactsList.generateFirst")}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <h3 className="font-medium mb-3 text-stone-700">
            {t("artifactsList.title")}
          </h3>
          <div className="space-y-2">
            {artifacts.map((artifact, index) => (
              <div
                key={artifact.id}
                className={`border border-stone-200 rounded-lg p-3 cursor-pointer hover:bg-stone-50 transition-all duration-300 ease-in-out ${
                  index === 0 ? "animate-fadeIn" : ""
                }`}
                onClick={() => onSelectArtifact(artifact.id)}
              >
                <div className="flex items-start justify-between">
                  {/* Left side with icon and text */}
                  <div className="flex">
                    <div className="mr-3 mt-0.5">
                      {getArtifactIcon(artifact.type)}
                    </div>
                    <div>
                      <div className="flex items-center">
                        <span className="font-medium text-sm capitalize text-stone-800">
                          {t(`artifactDetail.type.${artifact.type}`, {
                            defaultValue: artifact.type,
                          })}
                        </span>
                        <span className="ml-2 px-1.5 py-0.5 bg-stone-100 rounded text-xs text-stone-500 inline-block">
                          {artifact.sourceText
                            ? t("artifactsList.fromTextSelection")
                            : t("artifactsList.fromDocument")}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5 flex items-center">
                        <Clock size={11} className="mr-1 inline" />
                        {formatTime(artifact.timestamp)}
                      </div>
                    </div>
                  </div>

                  {/* Right side with delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteArtifact(artifact.id);
                    }}
                    className="p-1 text-stone-400 hover:text-red-500 rounded-full hover:bg-stone-100 transition-colors duration-200 ease-in-out"
                    aria-label={t("artifactsList.deleteArtifact")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// PropTypes validation
ArtifactsList.propTypes = {
  artifacts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      content: PropTypes.string.isRequired,
      timestamp: PropTypes.number.isRequired,
      sourceText: PropTypes.string,
    })
  ).isRequired,
  onSelectArtifact: PropTypes.func.isRequired,
  onCreateArtifact: PropTypes.func.isRequired,
  onDeleteArtifact: PropTypes.func.isRequired,
  selectedText: PropTypes.string,
  documentId: PropTypes.string.isRequired,
  userId: PropTypes.string,
};

// Create memoized version that only re-renders when relevant props change
export default memo(ArtifactsList, (prevProps, nextProps) => {
  // Return true if the props are the same, avoiding a re-render
  return (
    prevProps.artifacts === nextProps.artifacts &&
    prevProps.selectedText === nextProps.selectedText &&
    prevProps.documentId === nextProps.documentId &&
    prevProps.userId === nextProps.userId
  );
});

import { useMemo } from "react";
import { X, FileText, Download, BookOpen, Loader2 } from "lucide-react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import ActionMenu from "./ActionMenu";

import MarkdownSettings from "./markdown/MarkdownSettings";

/**
 * DocumentTopBar component that displays the document title and action buttons
 * Consolidates all top bar elements in one component for better maintainability
 */
const DocumentTopBar = ({
  title,
  docType,
  onClose,
  docData,
  fileUrl,
  handleDownload,

  // Reader Mode props
  isReaderModeAvailable,
  isReaderModeProcessing,
  readerMode,
  readerModeLoading,
  toggleReaderMode,

  // Markdown props
  isViewingMarkdown,
  onMarkdownSettingsChange,
}) => {
  const { t } = useTranslation();

  // Primary action buttons
  const primaryActions = useMemo(() => {
    const actions = [];

    // Only show download button when not viewing markdown
    if (!isViewingMarkdown) {
      actions.push(
        <button
          key="download"
          onClick={handleDownload}
          className="p-2 md:p-2 rounded-lg hover:bg-stone-700 transition-colors w-full md:w-auto flex items-center justify-start md:justify-center text-sm font-medium"
          title={t("documentViewer.downloadOriginal")}
          disabled={!fileUrl}
        >
          <Download className="w-5 h-5" />
          <span className="ml-2 md:hidden">{t("documentViewer.download")}</span>
        </button>
      );
    }

    return actions;
  }, [handleDownload, fileUrl, isViewingMarkdown, t]);

  // Secondary action buttons
  const secondaryActions = useMemo(() => {
    const actions = [];
    const noop = () => {}; // Empty function for closeModal

    // Reader Mode button (now toggles between Smart View and Original View)
    if (isReaderModeAvailable) {
      const isProcessing = isReaderModeProcessing;
      actions.push(
        <button
          key="reader-mode"
          onClick={() => {
            if (!isProcessing) {
              toggleReaderMode();
              noop();
            }
          }}
          className={`p-2 md:px-3 md:py-2 rounded-lg hover:bg-stone-700 transition-colors w-full md:w-auto flex items-center justify-start md:justify-center text-sm font-medium 
          } ${isProcessing ? "opacity-70" : ""}`}
          disabled={readerModeLoading || isProcessing}
          title={
            isProcessing
              ? t("documentViewer.processing")
              : readerMode
                ? t("documentViewer.viewOriginal")
                : t("documentViewer.smartView")
          }
        >
          {readerModeLoading || isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin md:mr-2" />
          ) : (
            <BookOpen className="w-5 h-5 md:mr-2" />
          )}
          <span className="ml-2">
            {isProcessing
              ? t("documentViewer.processing")
              : readerMode
                ? t("documentViewer.viewOriginal")
                : t("documentViewer.smartView")}
          </span>
        </button>
      );
    }

    return actions;
  }, [
    isReaderModeAvailable,
    isReaderModeProcessing,
    readerMode,
    readerModeLoading,
    toggleReaderMode,
    docData,
    t,
  ]);

  // Config actions
  const configActions = useMemo(() => {
    const actions = [];

    // Markdown Settings
    if (isViewingMarkdown) {
      actions.push(
        <div key="markdown-settings" className="w-full">
          <MarkdownSettings
            onSettingsChange={onMarkdownSettingsChange}
            inMobileSheet={true}
          />
        </div>
      );
    }

    return actions;
  }, [isViewingMarkdown, onMarkdownSettingsChange]);

  return (
    <div className="bg-stone-800 text-white py-4 px-4 flex items-center justify-between shrink-0">
      <div className="flex items-center overflow-hidden">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-stone-700 transition-colors mr-3 shrink-0"
          title={t("documentViewer.close")}
        >
          <X className="w-5 h-5" />
        </button>
        {title && (
          <div className="flex items-center text-sm overflow-hidden">
            <FileText className="w-4 h-4 mr-2 shrink-0" />
            <span className="font-medium truncate max-w-[150px] sm:max-w-[200px] md:max-w-md">
              {title}
            </span>
            {docType && (
              <span className="ml-2 px-2 py-0.5 bg-stone-700 rounded text-xs shrink-0">
                {docType}
              </span>
            )}
          </div>
        )}
      </div>
      <ActionMenu
        primaryActions={primaryActions}
        secondaryActions={secondaryActions}
        configActions={configActions}
      />
    </div>
  );
};

DocumentTopBar.propTypes = {
  title: PropTypes.string,
  docType: PropTypes.string,
  onClose: PropTypes.func.isRequired,

  // Document data
  docData: PropTypes.object,
  fileUrl: PropTypes.string,
  handleDownload: PropTypes.func,

  // Reader Mode props
  isReaderModeAvailable: PropTypes.bool,
  isReaderModeProcessing: PropTypes.bool,
  readerMode: PropTypes.bool,
  readerModeLoading: PropTypes.bool,
  toggleReaderMode: PropTypes.func,

  // Markdown props
  isViewingMarkdown: PropTypes.bool,
  onMarkdownSettingsChange: PropTypes.func,
};

export default DocumentTopBar;

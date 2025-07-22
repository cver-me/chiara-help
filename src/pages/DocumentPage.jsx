import {
  useState,
  useMemo,
  useCallback,
  useRef,
  lazy,
  Suspense,
  useDeferredValue,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth } from "../utils/firebase";
import useDocument from "../hooks/useDocument";
import SharedSkeletonUI from "../components/ui/SharedSkeletonUI";

// Lazy-load heavy viewer components so we only download what we need
const PdfViewer = lazy(() => import("../components/DocumentViewers/PdfViewer"));
const MarkdownViewer = lazy(
  () => import("../components/DocumentViewers/markdown/MarkdownViewer")
);

import DocumentTopBar from "../components/DocumentViewers/DocumentTopBar";

import { getDefaultViewerSettings } from "../components/DocumentViewers/markdown/savedmdsettings";
import PropTypes from "prop-types";

// Document loader component with skeleton UI
const DocumentLoader = ({ isLoading, error, onClose, docData, hasTitle }) => {
  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-white flex flex-col overflow-hidden fixed top-0 left-0 z-50">
        <DocumentTopBar
          title={
            hasTitle
              ? docData?.fileName || "Loading document..."
              : "Loading document..."
          }
          onClose={onClose}
          docData={docData}
          fileUrl=""
          handleDownload={() => {}}
          isReaderModeAvailable={false}
          readerMode={false}
          readerModeLoading={false}
          toggleReaderMode={() => {}}
          isViewingMarkdown={false}
          onMarkdownSettingsChange={() => {}}
        />
        <div className="flex-1 flex items-center justify-center px-4">
          <SharedSkeletonUI />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen bg-white flex flex-col overflow-hidden fixed top-0 left-0 z-50">
        <DocumentTopBar
          title="Error"
          onClose={onClose}
          docData={null}
          fileUrl=""
          handleDownload={() => {}}
          isReaderModeAvailable={false}
          readerMode={false}
          readerModeLoading={false}
          toggleReaderMode={() => {}}
          isViewingMarkdown={false}
          onMarkdownSettingsChange={() => {}}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-xl font-medium text-red-500">Error</p>
            <p className="text-gray-600">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// PropTypes validation
DocumentLoader.propTypes = {
  isLoading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  docData: PropTypes.object,
  hasTitle: PropTypes.bool,
};

const DocumentPage = () => {
  const { docId } = useParams();
  const navigate = useNavigate();

  // Custom hook handles Firestore + Storage loading and real-time updates
  const { docData, fileUrl, markdownUrl, loading, error } = useDocument(docId);

  // UI state
  const [viewMode, setViewMode] = useState("smart");

  // Markdown viewer settings (deferred for cheaper renders)
  const [markdownSettings, setMarkdownSettings] = useState(
    getDefaultViewerSettings()
  );
  const deferredMarkdownSettings = useDeferredValue(markdownSettings);

  const handleClose = useCallback(() => navigate(-1), [navigate]);

  // Determine if markdown view should be used
  const isSmartStructureAvailable = useMemo(() => {
    return (
      docData && docData.smartStructure?.status === "completed" && markdownUrl
    );
  }, [docData, markdownUrl]);

  const isViewingMarkdown = useMemo(() => {
    if (!docData) return false;
    if (viewMode === "smart" && isSmartStructureAvailable) return true;
    return (
      docData.contentType === "text/markdown" ||
      (docData.type && docData.type.includes("transcript"))
    );
  }, [docData, viewMode, isSmartStructureAvailable]);

  const documentTypeDisplay = useMemo(() => {
    if (!docData) return "";

    if (viewMode === "smart" && isSmartStructureAvailable) {
      return "SMART VIEW";
    } else if (docData.contentType) {
      // Handle known content types
      if (docData.contentType === "application/pdf") return "PDF";
      if (docData.contentType === "text/markdown") return "MD";

      // Extract and uppercase the subtype for other content types
      const subtype = docData.contentType.split("/")[1];
      return subtype ? subtype.toUpperCase() : "";
    } else if (docData.type && docData.type.includes("transcript")) {
      return "Transcript";
    } else {
      return "Document";
    }
  }, [docData, viewMode, isSmartStructureAvailable]);

  // Internal link element reused across downloads
  const downloadLinkRef = useRef(null);

  // Download original file
  const handleDownload = useCallback(async () => {
    if (!fileUrl) return;

    try {
      // Create the link element if it doesn't exist yet
      if (!downloadLinkRef.current) {
        downloadLinkRef.current = window.document.createElement("a");
        downloadLinkRef.current.style.display = "none";
        window.document.body.appendChild(downloadLinkRef.current);
      }

      // Get the file - use existing PDFViewer cache if possible
      let blob;
      if (window._pdfCache && window._pdfCache[fileUrl]) {
        // Reuse cached PDF data if available
        blob = window._pdfCache[fileUrl];
      } else {
        const response = await fetch(fileUrl);
        blob = await response.blob();
      }

      // Generate download URL
      const downloadUrl = URL.createObjectURL(blob);

      // Set up and trigger download
      const link = downloadLinkRef.current;
      link.href = downloadUrl;
      link.download = docData?.fileName || "document";
      link.click();

      // Clean up the object URL
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 100);
    } catch (err) {
      console.error("Download error:", err);
    }
  }, [fileUrl, docData?.fileName]);

  // Toggle between smart view (markdown) and original view (PDF)
  const toggleViewMode = useCallback(() => {
    if (!isSmartStructureAvailable) return;
    setViewMode((prevMode) => (prevMode === "smart" ? "original" : "smart"));
  }, [isSmartStructureAvailable]);

  const handleMarkdownSettingsChange = useCallback((newSettings) => {
    setMarkdownSettings(newSettings);
  }, []);

  // Viewer props based on document type and view mode
  const viewerProps = useMemo(() => {
    if (!docData || (!fileUrl && !markdownUrl)) return null;

    // Common props for markdown viewer
    const markdownViewerProps = {
      settings: deferredMarkdownSettings,
      documentId: docId,
      userId: auth.currentUser?.uid,
      docData: docData,
    };

    // If smart view is active and markdown URL is available, show markdown viewer
    if (viewMode === "smart" && isSmartStructureAvailable) {
      return {
        component: MarkdownViewer,
        props: {
          ...markdownViewerProps,
          fileUrl: markdownUrl,
        },
      };
    }

    // Determine component based on content type
    if (isViewingMarkdown) {
      return {
        component: MarkdownViewer,
        props: {
          ...markdownViewerProps,
          fileUrl,
        },
      };
    } else if (docData.contentType === "application/pdf") {
      return {
        component: PdfViewer,
        props: { fileUrl },
      };
    }

    // Default fallback
    return {
      component: "div",
      props: {
        className: "flex-1 flex items-center justify-center",
        children: (
          <p className="text-gray-500">
            Viewer for {docData.contentType || "this file type"} is not yet
            available.
          </p>
        ),
      },
    };
  }, [
    docData,
    fileUrl,
    markdownUrl,
    viewMode,
    isSmartStructureAvailable,
    deferredMarkdownSettings,
    docId,
    isViewingMarkdown,
  ]);

  // Render document viewer
  const renderViewer = useCallback(() => {
    if (!viewerProps) return null;

    const Component = viewerProps.component;
    return <Component {...viewerProps.props} />;
  }, [viewerProps]);

  // If still loading or error occurred
  if (loading || error) {
    return (
      <DocumentLoader
        isLoading={loading}
        error={error}
        onClose={handleClose}
        docData={docData} // Pass doc data for progressive loading
        hasTitle={!!docData} // Show real title if we have it
      />
    );
  }

  // Document title display
  const documentTitle =
    docData?.fileName || docData?.title || "Untitled Document";

  return (
    <div className="h-screen w-screen bg-white flex flex-col overflow-hidden fixed top-0 left-0 z-50">
      {/* Top Navigation Bar */}
      <DocumentTopBar
        // Basic props
        title={documentTitle}
        docType={documentTypeDisplay}
        onClose={handleClose}
        docData={docData}
        fileUrl={fileUrl}
        handleDownload={handleDownload}
        // Use existing props but with new names for backward compatibility
        isReaderModeAvailable={!!isSmartStructureAvailable}
        isReaderModeProcessing={
          docData?.smartStructure?.status === "processing"
        }
        readerMode={!!(viewMode === "smart" && isSmartStructureAvailable)}
        readerModeLoading={false}
        toggleReaderMode={toggleViewMode}
        // Markdown props
        isViewingMarkdown={!!isViewingMarkdown}
        onMarkdownSettingsChange={handleMarkdownSettingsChange}
      />

      {/* Document Viewer - Explicitly setting the height to subtract the navbar */}
      <div className="flex-1 flex relative h-[calc(100vh-64px)]">
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center h-full w-full px-4">
              <SharedSkeletonUI />
            </div>
          }
        >
          {renderViewer()}
        </Suspense>
      </div>
    </div>
  );
};

export default DocumentPage;

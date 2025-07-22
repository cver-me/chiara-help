import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { X, Download, Fullscreen, ZoomIn, ZoomOut } from "lucide-react";
import Mermaid from "./Mermaid";
import DownloadXmindButton from "./DownloadXmindButton";
import { ensureValidMindmapSyntax } from "../utils/mindmapUtils";
import { useTranslation } from "react-i18next";

const MindMapModal = ({ isOpen, onClose, mindMap, courseName }) => {
  const { t } = useTranslation();
  // Refs to store functions exposed by Mermaid component
  const zoomInFuncRef = useRef(null);
  const zoomOutFuncRef = useRef(null);
  const resetViewFuncRef = useRef(null); // Ref for reset view function
  const mermaidContainerRef = useRef(null); // Ref for the Mermaid container

  // Close overlay on ESC key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent scrolling of the body when overlay is open
      document.body.style.overflow = "hidden";

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        // Restore scrolling when overlay is closed
        document.body.style.overflow = "";
      };
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Rename handleRefresh to handleResetView
  const handleResetView = () => {
    // Call the reset function from Mermaid component
    if (resetViewFuncRef.current) {
      resetViewFuncRef.current();
    }
  };

  // Handler functions for zoom buttons
  const handleZoomIn = () => {
    if (zoomInFuncRef.current) {
      zoomInFuncRef.current();
    }
  };

  const handleZoomOut = () => {
    if (zoomOutFuncRef.current) {
      zoomOutFuncRef.current();
    }
  };

  // Handler for PNG download
  const handleDownloadPng = () => {
    if (!mermaidContainerRef.current) {
      console.error("Mermaid container ref not found.");
      alert(t("mindMapModal.errors.downloadFailedGeneric"));
      return;
    }

    const svgElement = mermaidContainerRef.current.querySelector("svg");

    if (!svgElement) {
      console.error("SVG element not found within the Mermaid container.");
      alert(t("mindMapModal.errors.downloadFailedGeneric"));
      return;
    }

    try {
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgElement);

      // Add XML namespace if missing (important for data URL conversion)
      if (!svgString.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(
          /^<svg/,
          '<svg xmlns="http://www.w3.org/2000/svg"'
        );
      }
      if (!svgString.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        svgString = svgString.replace(
          /^<svg/,
          '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
        );
      }

      // Create image
      const img = new window.Image();
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        // Create canvas
        const canvas = document.createElement("canvas");
        // Use SVG dimensions or provide fallbacks
        const svgWidth = svgElement.width?.baseVal?.value || 1200;
        const svgHeight = svgElement.height?.baseVal?.value || 800;
        // Optional: Add padding or scaling factor if needed
        canvas.width = svgWidth;
        canvas.height = svgHeight;
        const ctx = canvas.getContext("2d");

        // Optional: Fill background for transparency handling
        ctx.fillStyle = "#FDFBF7"; // Match background color
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw SVG onto canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Download as PNG
        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `${
          mindMap.title || t("mindMapModal.defaultFilename")
        }.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Cleanup
        URL.revokeObjectURL(url);
      };

      img.onerror = (error) => {
        console.error("Error loading SVG into image:", error);
        alert(t("mindMapModal.errors.conversionFailed"));
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (error) {
      console.error("Error during PNG generation:", error);
      alert(t("mindMapModal.errors.downloadFailedGeneric"));
    }
  };

  if (!isOpen || !mindMap) return null;

  // Ensure we have valid mindmap content
  const processedMermaidContent = mindMap.mermaid
    ? ensureValidMindmapSyntax(mindMap.mermaid)
    : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm">
      <div className="h-full w-full flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl w-full mx-auto p-3 md:p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-medium">
                  {mindMap.title}
                  {courseName && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      • {courseName}
                    </span>
                  )}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {/* Zoom out button */}
                <button
                  className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
                  title={t("mindMapModal.zoomOut")}
                  onClick={handleZoomOut}
                >
                  <ZoomOut className="h-5 w-5" />
                </button>

                {/* Zoom in button */}
                <button
                  className="p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
                  title={t("mindMapModal.zoomIn")}
                  onClick={handleZoomIn}
                >
                  <ZoomIn className="h-5 w-5" />
                </button>

                {/* Reset view button */}
                <button
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  title={t("mindMapModal.resetView")}
                  onClick={handleResetView}
                >
                  <Fullscreen className="h-5 w-5 text-gray-600" />
                </button>

                {/* Download XMind Button */}
                {processedMermaidContent && (
                  <DownloadXmindButton
                    mermaidText={processedMermaidContent}
                    mindMapTitle={mindMap.title}
                  />
                )}

                {/* Download PNG Button */}
                <button
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  title={t("mindMapModal.downloadPng")}
                  onClick={handleDownloadPng}
                >
                  <Download className="h-5 w-5 text-gray-600" />
                </button>
                <button
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  onClick={onClose}
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-white p-0 relative">
          <div
            ref={mermaidContainerRef}
            className="mindmap-container w-full h-full overflow-auto bg-stone-50"
          >
            {processedMermaidContent ? (
              <div className="p-0 h-full">
                <Mermaid
                  chart={processedMermaidContent}
                  externalZoomIn={zoomInFuncRef}
                  externalZoomOut={zoomOutFuncRef}
                  externalResetView={resetViewFuncRef}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">
                  {t("mindMapModal.errors.noContent")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

MindMapModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  mindMap: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    mermaid: PropTypes.string,
    courseId: PropTypes.string,
  }),
  courseName: PropTypes.string,
};

export default MindMapModal;

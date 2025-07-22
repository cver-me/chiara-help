import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import PropTypes from "prop-types";
import { ChevronLeft, ChevronRight, Scan, Loader2 } from "lucide-react";

// Set the workerSrc to the standard .js worker in public
pdfjs.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.mjs";

// Single, reusable spinner component
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center w-full h-full p-4">
    <Loader2 size={32} className="animate-spin text-stone-500" />
  </div>
);

const PdfViewer = ({ fileUrl }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0); // Initial scale, will be adjusted by fitToWidth on load
  const [pageInput, setPageInput] = useState("1");
  // Stores dimensions of the first page of the current document, used for fit-to-width calculations.
  const [firstPageDimensions, setFirstPageDimensions] = useState(null);
  const viewerContainerRef = useRef(null);

  // Handle page input change
  const handlePageInputChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    setPageInput(val);
  };
  const handlePageInputBlur = () => {
    let val = parseInt(pageInput, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (numPages && val > numPages) val = numPages;
    setPageNumber(val);
    setPageInput(val.toString());
  };
  const goToPrevPage = () => {
    setPageNumber((p) => {
      const newPage = Math.max(1, p - 1);
      setPageInput(newPage.toString());
      return newPage;
    });
  };
  const goToNextPage = () => {
    setPageNumber((p) => {
      const newPage = Math.min(numPages || 1, p + 1);
      setPageInput(newPage.toString());
      return newPage;
    });
  };
  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.25));

  const fitToWidth = () => {
    if (viewerContainerRef.current && firstPageDimensions?.width) {
      const containerWidth = viewerContainerRef.current.clientWidth;
      const newScale = (containerWidth / firstPageDimensions.width) * 0.98; // 2% padding
      setScale(newScale);
    } else if (viewerContainerRef.current) {
      // Fallback if dimensions aren't ready, try to set a reasonable default or wait.
      // For now, if dimensions aren't ready, we don't change scale from here.
      // console.warn("fitToWidth called before first page dimensions were set.");
    }
  };

  // Effect to automatically fit to width when a new document is loaded
  // and its first page dimensions become available.
  useEffect(() => {
    // Only fit to width if we have dimensions for the *current* fileUrl
    if (firstPageDimensions && firstPageDimensions.docFileUrl === fileUrl) {
      fitToWidth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPageDimensions, fileUrl]); // Rerun if firstPageDimensions change or fileUrl changes

  // Reset firstPageDimensions if fileUrl changes, so new dimensions are fetched for new file.
  useEffect(() => {
    setFirstPageDimensions(null); // Clear old dimensions when file changes
    setPageNumber(1); // Go to first page of new document
    setPageInput("1");
  }, [fileUrl]);

  // Sync page input with pageNumber when it changes (avoid setState in render)
  useEffect(() => {
    setPageInput(pageNumber.toString());
  }, [pageNumber]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-stone-50">
      <div className="w-full flex items-center justify-between px-4 py-1.5 border-b border-stone-200 bg-white shadow-sm">
        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-stone-300"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-1 border border-stone-200 rounded px-2 py-0.5 bg-stone-50 min-w-[56px] justify-center">
            <input
              type="text"
              value={pageInput}
              onChange={handlePageInputChange}
              onBlur={handlePageInputBlur}
              className="w-7 text-center bg-transparent outline-none text-stone-800 text-sm"
              style={{ minWidth: 18 }}
              aria-label="Page number"
            />
            <span className="text-stone-400 text-xs">/</span>
            <span className="text-stone-700 text-xs min-w-[16px] text-center">
              {numPages || "-"}
            </span>
          </div>
          <button
            onClick={goToNextPage}
            disabled={numPages ? pageNumber >= numPages : true}
            className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-stone-300"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="p-1.5 rounded hover:bg-stone-100 text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            aria-label="Zoom out"
          >
            -
          </button>
          <span className="w-10 text-center text-stone-700 font-medium text-sm">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1.5 rounded hover:bg-stone-100 text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={fitToWidth}
            className="p-1.5 rounded hover:bg-stone-100 text-stone-700 border border-stone-200 ml-2 focus:outline-none focus:ring-2 focus:ring-stone-300"
            aria-label="Fit to width"
          >
            <Scan size={15} />
          </button>
        </div>
      </div>
      <div
        ref={viewerContainerRef}
        className="flex-1 flex justify-center items-start w-full overflow-auto bg-stone-100"
      >
        <div className="mt-4 mb-4 shadow-lg">
          <Document
            file={fileUrl}
            loading={<LoadingSpinner />}
            onLoadSuccess={({ numPages: loadedNumPages }) => {
              setNumPages(loadedNumPages);
            }}
            onLoadError={console.error}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              loading={<LoadingSpinner />}
              onLoadSuccess={(page) => {
                // Store original page dimensions only from the first page of a new document.
                // This is used by fitToWidth and ensures zoom isn't reset on every page change.
                if (
                  pageNumber === 1 &&
                  (!firstPageDimensions ||
                    firstPageDimensions.docFileUrl !== fileUrl)
                ) {
                  setFirstPageDimensions({
                    width: page.originalWidth,
                    height: page.originalHeight,
                    docFileUrl: fileUrl, // Tag dimensions with the file they belong to
                  });
                }
              }}
            />
          </Document>
        </div>
      </div>
    </div>
  );
};

PdfViewer.propTypes = {
  fileUrl: PropTypes.string.isRequired,
};

export default PdfViewer;

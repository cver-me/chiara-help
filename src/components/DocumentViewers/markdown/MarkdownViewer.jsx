import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
  lazy,
  Suspense,
} from "react";
import PropTypes from "prop-types";
import { ChevronLeft, List, Search, AudioLines } from "lucide-react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import "./markdown-custom.css";
import { getDefaultViewerSettings, saveSettings } from "./savedmdsettings";
import MarkdownTOC from "./MarkdownTOC";
import MarkdownSearch from "./MarkdownSearch";
import { generateHeadingId } from "./markdownUtils";
import { ScrollableTable, ScrollableMath } from "./MarkdownScrollableElements";
import MarkdownImage from "./MarkdownImage";
import {
  DocumentAssistantPanel,
  AssistantPanelToggle,
  TextSelectionManager,
} from "../../DocumentAssistant";
import { throttle } from "../../../utils/throttle";

import SidebarFooter from "./SidebarFooter";
import SharedSkeletonUI from "../../ui/SharedSkeletonUI";

// Lazy load the ErrorDisplay component
const ErrorDisplay = lazy(() => import("../../ui/ErrorDisplay"));

// Create a cache for parsed content
const contentCache = new Map();

// Maximum cache size to prevent memory issues
const MAX_CACHE_SIZE = 10;

// Create a memoized version of ReactMarkdown to avoid re-rendering when content hasn't changed
const MemoizedMarkdown = memo(
  ({ content, remarkPlugins, rehypePlugins, components }) => {
    return (
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => {
    // Re-render if content or styleKey has changed
    return (
      prevProps.content === nextProps.content &&
      prevProps.styleKey === nextProps.styleKey
    );
  }
);

// Add display name
MemoizedMarkdown.displayName = "MemoizedMarkdown";

MemoizedMarkdown.propTypes = {
  content: PropTypes.string.isRequired,
  remarkPlugins: PropTypes.array,
  rehypePlugins: PropTypes.array,
  components: PropTypes.object,
  styleKey: PropTypes.string,
};

// Custom rehype plugin to add IDs to headings
const customRehypeSlug = () => {
  return (tree) => {
    let idMap = {};

    const visitor = (node) => {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName)) {
        // Extract text content from the heading
        let textContent = "";
        const extractText = (n) => {
          if (n.type === "text") {
            textContent += n.value;
          }
          if (n.children) {
            n.children.forEach(extractText);
          }
        };
        extractText(node);

        // Generate a slug ID
        let id = generateHeadingId(textContent);

        // Handle duplicate IDs
        if (idMap[id]) {
          idMap[id]++;
          id = `${id}-${idMap[id]}`;
        } else {
          idMap[id] = 1;
        }

        // Add the ID to the node
        node.properties = node.properties || {};
        node.properties.id = id;

        // Add class for uppercase headings (h1 only)
        if (node.tagName === "h1") {
          // Check if text is all uppercase (allowing for non-letter characters)
          const hasLetters = /[a-zA-Z]/.test(textContent);
          const isAllUppercase =
            hasLetters && textContent === textContent.toUpperCase();

          if (isAllUppercase) {
            node.properties.className =
              (node.properties.className || "") + " uppercase-heading";
          }
        }
      }

      if (node.children) {
        node.children.forEach(visitor);
      }
    };

    visitor(tree);
    return tree;
  };
};

// Cache for storing processed line positions to avoid redundant calculations
const linePositionsCache = new Map();
const MAX_LINE_POSITIONS_CACHE_SIZE = 5;

// Custom rehype plugin to add data-line attributes to elements for better search targeting
const customRehypeLineNumbers = () => {
  return (tree, file) => {
    const content = file.value || "";

    // Get line positions from cache or calculate
    let linePositions;
    if (linePositionsCache.has(content)) {
      linePositions = linePositionsCache.get(content);
    } else {
      linePositions = [];
      // Create an array of newline positions for line number reference
      let position = content.indexOf("\n");
      while (position !== -1) {
        linePositions.push(position);
        position = content.indexOf("\n", position + 1);
      }

      // Store in cache
      linePositionsCache.set(content, linePositions);

      // Manage cache size
      if (linePositionsCache.size > MAX_LINE_POSITIONS_CACHE_SIZE) {
        const firstKey = linePositionsCache.keys().next().value;
        linePositionsCache.delete(firstKey);
      }
    }

    const visitor = (node) => {
      // Only add line info to elements that could be targets for search
      if (
        node.type === "element" &&
        [
          "p",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "li",
          "pre",
          "blockquote",
          "table",
        ].includes(node.tagName)
      ) {
        // If the node has position information
        if (node.position && node.position.start && node.position.end) {
          const startLine = node.position.start.line;
          const endLine = node.position.end.line;

          // Add data attributes for line information
          node.properties = node.properties || {};
          node.properties["data-start-line"] = startLine;
          node.properties["data-end-line"] = endLine;

          // Add a specific class for search result targeting and precise text selection
          node.properties.className =
            (node.properties.className || "") +
            " md-content-block text-container md-text-only-selection";

          // Add an ID based on line number for direct targeting
          node.properties.id = node.properties.id || `md-line-${startLine}`;
        }
      }

      if (node.children) {
        node.children.forEach(visitor);
      }
    };

    visitor(tree);
    return tree;
  };
};

// Helper function to check if settings objects are equal
const areSettingsEqual = (settings1, settings2) => {
  if (!settings1 || !settings2) return false;

  return (
    settings1.backgroundColor === settings2.backgroundColor &&
    settings1.fontFamily === settings2.fontFamily &&
    settings1.fontSize === settings2.fontSize &&
    settings1.lineHeight === settings2.lineHeight
  );
};

// Generate a unique key based on settings to force re-render when settings change
const generateSettingsKey = (settings) => {
  if (!settings) return "default";
  return `${settings.backgroundColor}-${settings.fontFamily}-${settings.fontSize}-${settings.lineHeight}`;
};

const MarkdownViewer = ({
  fileUrl,
  settings = null,
  documentId,
  userId,
  docData,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [markdownContent, setMarkdownContent] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState("contents"); // "contents" or "search"
  const [isMobileView, setIsMobileView] = useState(false);
  const contentRef = useRef(null);

  // Document Assistant state
  const [isAssistantPanelOpen, setIsAssistantPanelOpen] = useState(false);
  const [selectedText, setSelectedText] = useState(null);
  const [isPanelDetailView, setIsPanelDetailView] = useState(false);

  // Save the last settings we applied to avoid unnecessary updates
  const lastAppliedSettingsRef = useRef(null);

  // Use settings from props or default settings if not provided
  const activeSettings = useMemo(() => {
    const defaultSettings = getDefaultViewerSettings();

    // If no prop settings provided, use default settings (which now includes saved settings)
    if (!settings) {
      return defaultSettings;
    }

    // Check if props have all required settings
    const hasAllSettings =
      settings.backgroundColor !== undefined &&
      settings.fontFamily !== undefined &&
      settings.fontSize !== undefined &&
      settings.lineHeight !== undefined;

    if (hasAllSettings) {
      // If props are complete, check if they're different from last applied settings
      if (!areSettingsEqual(settings, lastAppliedSettingsRef.current)) {
        // Only save if settings have changed
        saveSettings(settings);
        lastAppliedSettingsRef.current = settings;
      }
      return settings;
    } else {
      // Otherwise merge with defaults, with props taking precedence
      const mergedSettings = {
        ...defaultSettings,
        ...settings,
      };

      // Only save if settings have changed
      if (!areSettingsEqual(mergedSettings, lastAppliedSettingsRef.current)) {
        saveSettings(mergedSettings);
        lastAppliedSettingsRef.current = mergedSettings;
      }
      return mergedSettings;
    }
  }, [settings]);

  // Create a unique key based on active settings to force re-render when they change
  const settingsKey = generateSettingsKey(activeSettings);

  // Image component - wrapped to inject Firestore IDs; declared before markdownComponents to avoid TDZ issues
  const ImageComponent = useMemo(() => {
    const ImageComponentWrapper = (props) => (
      <MarkdownImage {...props} documentId={documentId} userId={userId} />
    );

    ImageComponentWrapper.displayName = "ImageComponentWrapper";
    ImageComponentWrapper.propTypes = {
      src: PropTypes.string,
      alt: PropTypes.string,
    };

    return ImageComponentWrapper;
  }, [documentId, userId]);

  // Memoize markdown plugin arrays to keep reference stable and avoid unnecessary re-renders
  const remarkPlugins = useMemo(() => [remarkMath, remarkGfm], []);
  const rehypePlugins = useMemo(
    () => [rehypeKatex, customRehypeSlug, customRehypeLineNumbers],
    []
  );

  // Memoize components map for ReactMarkdown
  const markdownComponents = useMemo(
    () => ({
      table: ScrollableTable,
      code: ({ className, children, ...props }) => {
        if (
          className === "math math-display" ||
          className === "math math-inline"
        ) {
          const content = String(children).replace(/\n$/, "");
          return (
            <ScrollableMath
              value={content}
              inline={className === "math math-inline"}
            />
          );
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      img: ImageComponent,
    }),
    [ImageComponent]
  );

  // REPLACE existing dyslexic font effect with cleanup-aware version
  useEffect(() => {
    const id = "dyslexic-font-stylesheet";
    if (activeSettings.fontFamily === "font-dyslexic") {
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.href = "/dyslexic-font.css";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
    } else {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
    }

    return () => {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
    };
  }, [activeSettings.fontFamily]);

  // REPLACE the entire mobile-view resize effect with throttled version
  useEffect(() => {
    const checkMobileView = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);

      if (window.innerWidth < 1024 && !mobile) {
        setIsSidebarCollapsed(true);
      } else if (window.innerWidth >= 1024) {
        // On large screens always expand sidebar
        setIsSidebarCollapsed(false);
      }
    };

    // Call immediately on mount
    checkMobileView();

    const throttledResize = throttle(checkMobileView, 200);
    window.addEventListener("resize", throttledResize);

    return () => {
      window.removeEventListener("resize", throttledResize);
    };
  }, []);

  // Create a better fetch function with caching
  const fetchMarkdownWithCache = useCallback(async (url) => {
    if (!url) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Check if we already have this content in cache
      if (contentCache.has(url)) {
        setMarkdownContent(contentCache.get(url));
        setLoading(false);
        return;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch markdown: ${response.statusText}`);
      }

      const text = await response.text();

      // Store in cache with better management
      contentCache.set(url, text);

      // Keep cache size under control
      if (contentCache.size > MAX_CACHE_SIZE) {
        // Delete oldest entry (first key in the Map)
        const firstKey = contentCache.keys().next().value;
        contentCache.delete(firstKey);
      }

      setMarkdownContent(text);
    } catch (err) {
      console.error("Error fetching markdown:", err);
      setError("Failed to load markdown content");
    } finally {
      setLoading(false);
    }
  }, []);

  // Use our improved fetch function
  useEffect(() => {
    if (fileUrl) {
      fetchMarkdownWithCache(fileUrl);
    }
  }, [fileUrl, fetchMarkdownWithCache]);

  // Extract only the first part of the background color class
  const bgColorClass = activeSettings.backgroundColor.split(" ")[0];
  // Extract any text color class if present
  const textColorClass = activeSettings.backgroundColor.includes("text-")
    ? activeSettings.backgroundColor
        .split(" ")
        .find((cls) => cls.startsWith("text-"))
    : "";

  // Memoize prose size class based on font size
  const proseSize = useMemo(() => {
    const fontSize = activeSettings.fontSize || 16;

    if (fontSize <= 12) return "prose-sm";
    if (fontSize <= 14) return "prose-base";
    if (fontSize <= 18) return "prose-lg";
    if (fontSize <= 24) return "prose-xl";
    return "prose-2xl";
  }, [activeSettings.fontSize]);

  // Memoize prose color scheme based on background color
  const proseColorScheme = useMemo(() => {
    if (activeSettings.backgroundColor.includes("bg-stone-800")) {
      return "prose-invert";
    }
    return "prose-stone";
  }, [activeSettings.backgroundColor]);

  // Memoize custom styles not covered by Tailwind classes
  const customStyles = useMemo(() => {
    return {
      lineHeight: activeSettings.lineHeight,
    };
  }, [activeSettings.lineHeight]);

  // Toggle sidebar collapsed state for desktop
  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  // Switch between Contents and Search tabs
  const switchSidebarTab = useCallback((tab) => {
    setActiveSidebarTab(tab);

    // If switching to search tab, focus the search input via a small delay
    if (tab === "search") {
      setTimeout(() => {
        const searchInput = document.querySelector(".markdown-search input");
        if (searchInput) {
          searchInput.focus();
        }
      }, 100);
    }
  }, []);

  // Import the search highlight utilities for better organization
  const handleSearchResultClick = useCallback((result) => {
    // Use the utility function from searchHighlightUtils.js for this functionality
    import("./searchHighlightUtils.js")
      .then(({ navigateToSearchResult }) => {
        navigateToSearchResult(result);
      })
      .catch((err) => {
        console.error("Error importing search highlight utilities:", err);
      });
  }, []);

  // Handle TOC heading click
  const handleHeadingClick = useCallback((id) => {
    const element = document.getElementById(id);
    if (!element) return;

    try {
      // Get scrollable container (often the content div or document)
      const scrollContainer = contentRef.current || document.documentElement;

      // Calculate a scroll margin to offset from the top (for headers/navigation)
      const scrollMargin = 80; // Adjust this value based on your UI

      // Calculate scroll position more precisely
      const elementRect = element.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const scrollTop =
        elementRect.top -
        containerRect.top +
        scrollContainer.scrollTop -
        scrollMargin;

      // Use scrollTo instead of scrollIntoView for more control
      scrollContainer.scrollTo({
        top: scrollTop,
        behavior: "smooth",
      });

      // Highlight the heading briefly for better visibility
      const originalBackground = element.style.backgroundColor;
      element.style.backgroundColor = "rgba(120, 113, 108, 0.2)";
      element.style.transition = "background-color 1s ease";

      setTimeout(() => {
        element.style.backgroundColor = originalBackground;
      }, 1500);
    } catch (err) {
      console.error("Error scrolling to heading:", err);
    }
  }, []);

  // Handle text selection with optimized panel opening
  const handleTextSelection = useCallback(
    (text) => {
      // Only update if there's a real change
      if (text !== selectedText) {
        setSelectedText(text);

        // Open the panel if text is selected and panel is closed - using the same optimized approach
        if (text && !isAssistantPanelOpen) {
          // Update ref immediately
          panelVisibilityRef.current = true;

          // Use requestAnimationFrame for smoother UI update
          requestAnimationFrame(() => {
            // Update state directly (no functional update)
            setIsAssistantPanelOpen(true);

            // Force reflow to ensure immediate animation start
            document.body.offsetHeight;
          });
        }
      }
    },
    [isAssistantPanelOpen, selectedText]
  );

  // Track panel visibility with a ref to avoid render delays
  const panelVisibilityRef = useRef(false);

  // Toggle the assistant panel with immediate response
  const toggleAssistantPanel = useCallback(() => {
    // Update the ref immediately for synchronous access
    panelVisibilityRef.current = !isAssistantPanelOpen;

    // Use requestAnimationFrame for the DOM update to happen in the next paint
    requestAnimationFrame(() => {
      // Don't use functional update to avoid batching delay
      setIsAssistantPanelOpen(panelVisibilityRef.current);

      // If panel was opened, force layout calculation and collapse the left sidebar
      if (panelVisibilityRef.current) {
        // Force reflow to ensure immediate animation start
        document.body.offsetHeight;
        // Collapse the left sidebar when opening the assistant panel
        setIsSidebarCollapsed(true);
      }
    });
  }, [isAssistantPanelOpen]);

  // Loading indicator with skeleton UI for consistency with DocumentPage
  const loadingIndicator = <SharedSkeletonUI />;

  return (
    <div
      className={`w-full h-full flex flex-col ${bgColorClass} ${textColorClass}`}
    >
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        {!isMobileView && markdownContent && !loading && !error && (
          <div
            className={`sidebar-container transition-all duration-300 ease-in-out ${
              isSidebarCollapsed ? "w-12" : "w-64"
            } bg-white border-r border-stone-200 flex flex-col shadow-sm ${
              isSidebarCollapsed ? "h-auto" : "h-full"
            }`}
          >
            {/* Sidebar Header - Only show when expanded */}
            {!isSidebarCollapsed && (
              <div className="flex items-center justify-between p-3 border-b border-stone-200">
                <h3 className="font-medium text-stone-800 flex items-center truncate">
                  <List size={18} className="mr-2 flex-shrink-0" />
                  <span className="truncate">
                    {t("markdownViewer.document")}
                  </span>
                </h3>

                <button
                  onClick={toggleSidebarCollapse}
                  className="p-1 rounded hover:bg-stone-100 text-stone-500 flex-shrink-0"
                  aria-label={t("markdownViewer.collapseSidebar")}
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            )}

            {/* Tab Navigation */}
            {!isSidebarCollapsed && (
              <div className="flex border-b border-stone-200">
                <button
                  className={`flex-1 py-2 px-4 text-sm font-medium ${
                    activeSidebarTab === "contents"
                      ? "text-stone-900 border-b-2 border-stone-600"
                      : "text-stone-500 hover:text-stone-700"
                  }`}
                  onClick={() => switchSidebarTab("contents")}
                >
                  {t("markdownViewer.contentsTab")}
                </button>
                <button
                  className={`flex-1 py-2 px-4 text-sm font-medium ${
                    activeSidebarTab === "search"
                      ? "text-stone-900 border-b-2 border-stone-600"
                      : "text-stone-500 hover:text-stone-700"
                  }`}
                  onClick={() => switchSidebarTab("search")}
                >
                  {t("markdownViewer.searchTab")}
                </button>
              </div>
            )}

            {/* Sidebar Content */}
            {!isSidebarCollapsed && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto">
                  {activeSidebarTab === "contents" ? (
                    <MarkdownTOC
                      markdownContent={markdownContent}
                      onHeadingClick={handleHeadingClick}
                    />
                  ) : (
                    <MarkdownSearch
                      markdownContent={markdownContent}
                      onResultClick={handleSearchResultClick}
                    />
                  )}
                </div>

                {/* Use updated SidebarFooter without onAudioReady */}
                {documentId && (
                  <SidebarFooter documentId={documentId} docData={docData} />
                )}
              </div>
            )}

            {/* Collapsed State - Show only content and search icons */}
            {isSidebarCollapsed && (
              <div className="flex flex-col items-center py-2 space-y-2">
                <button
                  className={`p-2 rounded-full ${
                    activeSidebarTab === "contents"
                      ? "bg-stone-100 text-stone-700"
                      : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                  }`}
                  onClick={() => {
                    setIsSidebarCollapsed(false);
                    switchSidebarTab("contents");
                  }}
                  aria-label={t("markdownViewer.showTOC")}
                >
                  <List size={18} />
                </button>
                <button
                  className={`p-2 rounded-full ${
                    activeSidebarTab === "search"
                      ? "bg-stone-100 text-stone-700"
                      : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                  }`}
                  onClick={() => {
                    setIsSidebarCollapsed(false);
                    switchSidebarTab("search");
                  }}
                  aria-label={t("markdownViewer.searchInDocument")}
                >
                  <Search size={18} />
                </button>

                {/* Audio button for collapsed state */}
                {documentId && (
                  <button
                    className="p-2 rounded-full bg-stone-50 text-stone-500 hover:bg-stone-100"
                    onClick={() => {
                      setIsSidebarCollapsed(false);
                    }}
                    aria-label={t("markdownViewer.listenToDocument")}
                  >
                    <AudioLines size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Main content area with assistant panel integration */}
        <div className="flex flex-1 h-full overflow-hidden">
          <div
            className={`transition-all duration-300 ease-in-out flex-1`}
            style={{
              width: isAssistantPanelOpen
                ? isPanelDetailView
                  ? "55%"
                  : "75%"
                : "100%",
            }}
          >
            <div
              ref={contentRef}
              className={`h-full overflow-auto px-4 ${bgColorClass} ${textColorClass}`}
            >
              {loading ? (
                loadingIndicator
              ) : error ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <Suspense
                    fallback={
                      <div className="text-stone-500">
                        Loading error display...
                      </div>
                    }
                  >
                    <ErrorDisplay
                      message={error}
                      type="error"
                      className="max-w-md shadow-md"
                    />
                  </Suspense>
                </div>
              ) : (
                <div
                  className={`prose ${proseColorScheme} ${proseSize} max-w-4xl mx-auto p-8 pb-16 ${activeSettings.fontFamily} transition-all duration-300 ease-in-out markdown-custom-spacing`}
                  style={customStyles}
                  key={settingsKey}
                >
                  <MemoizedMarkdown
                    content={markdownContent}
                    remarkPlugins={remarkPlugins}
                    rehypePlugins={rehypePlugins}
                    styleKey={settingsKey}
                    components={markdownComponents}
                  />
                </div>
              )}

              {/* Text Selection Manager */}
              <TextSelectionManager
                containerRef={contentRef}
                onSelectionChange={handleTextSelection}
              />
            </div>
          </div>

          {/* Document Assistant Panel with optimized animation */}
          <div
            className="h-full pl-4 pt-4 pr-4 transition-[opacity,transform] duration-150 ease-out"
            style={{
              width: isPanelDetailView ? "45%" : "25%",
              transform: isAssistantPanelOpen
                ? "translateX(0)"
                : "translateX(10%)",
              opacity: isAssistantPanelOpen ? 1 : 0,
              pointerEvents: isAssistantPanelOpen ? "auto" : "none",
              position: isAssistantPanelOpen ? "relative" : "absolute",
              right: isAssistantPanelOpen ? "auto" : 0,
              willChange: "transform, opacity", // optimize animation performance
            }}
          >
            <div className="h-full w-full bg-white shadow-lg rounded-lg border border-gray-200">
              {isAssistantPanelOpen && (
                <DocumentAssistantPanel
                  isOpen={isAssistantPanelOpen}
                  onClose={toggleAssistantPanel}
                  selectedText={selectedText}
                  documentId={documentId}
                  userId={userId}
                  onViewChange={(view) =>
                    setIsPanelDetailView(view === "detail")
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assistant Panel Toggle Button */}
      {!isAssistantPanelOpen && (
        <AssistantPanelToggle
          onClick={toggleAssistantPanel}
          isOpen={isAssistantPanelOpen}
        />
      )}
    </div>
  );
};

MarkdownViewer.propTypes = {
  fileUrl: PropTypes.string.isRequired,
  settings: PropTypes.shape({
    backgroundColor: PropTypes.string,
    fontFamily: PropTypes.string,
    fontSize: PropTypes.number,
    lineHeight: PropTypes.number,
  }),
  documentId: PropTypes.string,
  userId: PropTypes.string,
  docData: PropTypes.object,
};

export default MarkdownViewer;

import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  extractHeadingsWithCache,
  createHeadingHierarchy,
} from "./markdownUtils";

/**
 * Renders a single item in the table of contents
 */
const TOCItem = ({
  item,
  onHeadingClick,
  expandedItems,
  toggleExpanded,
  activeId,
}) => {
  const { t } = useTranslation();
  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expandedItems[item.id];
  const isActive = activeId === item.id;

  // We no longer highlight parent headings when children are active
  // Only the exact active heading will be highlighted

  const handleClick = (e) => {
    e.preventDefault();
    onHeadingClick(item.id);
  };

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleExpanded(item.id);
  };

  return (
    <div className="toc-item">
      <div
        className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer transition-colors duration-200 ease-in-out ${
          isActive
            ? "bg-stone-100 text-stone-900 font-medium"
            : "text-stone-700"
        } hover:bg-stone-50`}
        onClick={handleClick}
      >
        {hasChildren && (
          <button
            onClick={handleToggle}
            className="mr-1.5 p-0.5 rounded hover:bg-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-200 text-stone-500 flex-shrink-0"
            aria-label={
              isExpanded
                ? t("markdownTOC.collapseSection")
                : t("markdownTOC.expandSection")
            }
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-stone-500" />
            ) : (
              <ChevronRight size={14} className="text-stone-500" />
            )}
          </button>
        )}
        <span className="text-sm truncate">
          {item.level === 1 ? <strong>{item.text}</strong> : item.text}
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div className="ml-4 pl-2 border-l border-stone-100 transition-all duration-200 ease-in-out">
          {item.children.map((child) => (
            <TOCItem
              key={child.id}
              item={child}
              onHeadingClick={onHeadingClick}
              expandedItems={expandedItems}
              toggleExpanded={toggleExpanded}
              activeId={activeId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// PropTypes for TOCItem
TOCItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired,
    level: PropTypes.number.isRequired,
    children: PropTypes.arrayOf(PropTypes.object),
  }).isRequired,
  onHeadingClick: PropTypes.func.isRequired,
  expandedItems: PropTypes.object.isRequired,
  toggleExpanded: PropTypes.func.isRequired,
  activeId: PropTypes.string,
};

/**
 * Table of Contents component for markdown documents
 * Provides navigation and displays the document structure
 */
const MarkdownTOC = ({ markdownContent, onHeadingClick }) => {
  const { t } = useTranslation();
  const [headings, setHeadings] = useState([]);
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [expandedItems, setExpandedItems] = useState({});
  const tocContainerRef = useRef(null);

  // Extract headings from markdown content
  useEffect(() => {
    if (!markdownContent) return;

    const extractedHeadings = extractHeadingsWithCache(markdownContent);
    const hierarchy = createHeadingHierarchy(extractedHeadings);
    setHeadings(hierarchy);

    // Initialize expanded state for all items
    const initialExpandedState = {};
    hierarchy.forEach((item) => {
      initialExpandedState[item.id] = true; // Top level items start expanded
    });
    setExpandedItems(initialExpandedState);
  }, [markdownContent]);

  // Handle document scrolling to update active heading
  useEffect(() => {
    // Create a debounced version of the scroll handler
    let scrollTimeoutId = null;

    const handleScroll = () => {
      // Use debouncing to avoid excessive calculations during rapid scrolling
      if (scrollTimeoutId) {
        clearTimeout(scrollTimeoutId);
      }

      scrollTimeoutId = setTimeout(() => {
        // Find all heading elements in the document
        const headingElements = Array.from(
          document.querySelectorAll("h1, h2, h3, h4, h5, h6")
        ).filter((el) => el.id); // Only consider headings with IDs

        if (!headingElements.length) return;

        // Find the closest heading above the viewport or at the top
        // These values are used implicitly in isElementVisible function
        const buffer = 100; // Consider headings slightly above viewport

        // Function to check if a heading is visible on screen
        // Favor headings at the top of the viewport
        const isElementVisible = (el) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.top <= buffer && // Element is at or above the viewport top + buffer
            rect.bottom >= 0 // Element's bottom is visible
          );
        };

        // First check for visible headings
        const visibleHeadings = headingElements.filter(isElementVisible);

        if (visibleHeadings.length) {
          // If we have visible headings, use the first one (topmost)
          setActiveHeadingId(visibleHeadings[0].id);
          expandParentHeadings(visibleHeadings[0].id, headingElements);
          return;
        }

        // If no headings are visible, find the last heading above the viewport
        const headingsAboveViewport = headingElements.filter(
          (el) => el.getBoundingClientRect().bottom <= buffer
        );

        if (headingsAboveViewport.length) {
          const lastHeadingAbove =
            headingsAboveViewport[headingsAboveViewport.length - 1];
          setActiveHeadingId(lastHeadingAbove.id);
          expandParentHeadings(lastHeadingAbove.id, headingElements);
        } else if (headingElements.length) {
          // If we're at the very top, use the first heading
          setActiveHeadingId(headingElements[0].id);
          expandParentHeadings(headingElements[0].id, headingElements);
        }
      }, 100); // 100ms debounce
    };

    // Expand parent headings when a child heading is active
    const expandParentHeadings = (activeHeading, allHeadings) => {
      // Extract all parent heading IDs
      const parentIds = [];
      const currentId = activeHeading;

      // Find potential parent IDs by removing segments from the end
      // e.g., "1-2-3" -> check "1-2" and "1"
      const parts = currentId.split("-");
      while (parts.length > 1) {
        parts.pop();
        const parentId = parts.join("-");
        parentIds.push(parentId);
      }

      // Only expand headings that actually exist in the document
      const existingParentIds = parentIds.filter((id) =>
        allHeadings.some((heading) => heading.id === id)
      );

      // Update expanded state
      if (existingParentIds.length > 0) {
        setExpandedItems((prev) => {
          const newState = { ...prev };
          existingParentIds.forEach((id) => {
            newState[id] = true;
          });
          return newState;
        });
      }
    };

    // Add scroll listener with passive option for better performance
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutId) {
        clearTimeout(scrollTimeoutId);
      }
    };
  }, []);

  // Scroll the TOC container to keep active heading visible
  useEffect(() => {
    if (!activeHeadingId || !tocContainerRef.current) return;

    const activeElement = tocContainerRef.current.querySelector(
      `.toc-item div[class*="${activeHeadingId === activeHeadingId ? "bg-stone-100" : ""}"]`
    );

    if (activeElement) {
      const containerRect = tocContainerRef.current.getBoundingClientRect();
      const elementRect = activeElement.getBoundingClientRect();

      // Check if element is outside visible area of container
      if (
        elementRect.top < containerRect.top ||
        elementRect.bottom > containerRect.bottom
      ) {
        // Scroll just enough to bring the element into view
        activeElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [activeHeadingId]);

  /**
   * Toggle expanded state for a TOC item
   */
  const toggleExpanded = (id) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  /**
   * Scroll to the corresponding heading in the document
   */
  const scrollToHeading = (id) => {
    // Set active heading ID for UI feedback immediately
    setActiveHeadingId(id);

    // Use the provided callback if available, otherwise implement default behavior
    if (onHeadingClick) {
      onHeadingClick(id);
      return;
    }

    setTimeout(() => {
      // Make sure to get the exact element by ID - this is critical for duplicate heading names
      const element = document.getElementById(id);

      // Log error if element not found - helpful for debugging
      if (!element) {
        console.warn(`TOC: Element with ID "${id}" not found in document`);
        return;
      }

      try {
        // Find the scrollable container
        let scrollContainer = null;
        let parent = element.parentElement;

        // Find first scrollable parent
        while (parent && parent !== document.body) {
          const style = window.getComputedStyle(parent);
          const overflow =
            style.getPropertyValue("overflow") ||
            style.getPropertyValue("overflow-y");

          if (overflow === "auto" || overflow === "scroll") {
            scrollContainer = parent;
            break;
          }
          parent = parent.parentElement;
        }

        // Default to document if no scrollable container found
        scrollContainer = scrollContainer || document.documentElement;

        // Calculate positions
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const elementRelativeTop = elementRect.top - containerRect.top;

        // Set scroll position with offset from top
        const scrollMargin = 80;

        // Check if this is potentially the last heading with little content below it
        let newScrollTop =
          elementRelativeTop + scrollContainer.scrollTop - scrollMargin;

        // Get the total height of the content and the viewport
        const scrollContainerHeight = scrollContainer.scrollHeight;
        const viewportHeight = window.innerHeight;

        // Calculate the position of the element from the bottom of the document
        const distanceFromBottom =
          scrollContainerHeight - (newScrollTop + elementRect.height);

        // If there's not enough content below the heading (less than viewport height)
        // adjust the scroll position to prevent breaking the layout
        if (distanceFromBottom < viewportHeight * 0.7) {
          // If we're near the bottom of the document, use a different scroll strategy
          // that ensures we don't over-scroll
          const maxScroll = scrollContainerHeight - viewportHeight;

          // If the calculated scroll would be too close to the max scroll position,
          // adjust it to leave some content visible at the bottom
          if (newScrollTop > maxScroll * 0.8) {
            // Adjust the scroll position to show more content
            // Use either a reduced offset or a percentage of the max scroll
            newScrollTop = Math.min(newScrollTop, maxScroll * 0.9);
          }
        }

        // Scroll the container
        scrollContainer.scrollTo({
          top: newScrollTop,
          behavior: "smooth",
        });

        // Highlight the heading briefly for better visibility with a more noticeable effect
        const originalBackground = element.style.backgroundColor;
        const originalTransition = element.style.transition;

        // More noticeable highlight for better visibility
        element.style.backgroundColor = "rgba(120, 113, 108, 0.35)";
        element.style.transition = "background-color 0.2s ease";

        // Add a subtle border for better identification of which exact heading is targeted
        const originalOutline = element.style.outline;
        element.style.outline = "2px solid rgba(120, 113, 108, 0.5)";

        setTimeout(() => {
          // Fade out the highlighting effect
          element.style.backgroundColor = "rgba(120, 113, 108, 0.15)";
          element.style.transition = "all 1.5s ease";
          element.style.outline = "none";

          setTimeout(() => {
            // Return to original state
            element.style.backgroundColor = originalBackground;
            element.style.transition = originalTransition;
            element.style.outline = originalOutline;
          }, 1000);
        }, 1000);
      } catch (err) {
        console.error("Error scrolling to heading:", err);
      }
    }, 100);
  };

  return (
    <div className="toc-container h-full flex flex-col">
      <div
        ref={tocContainerRef}
        className="flex-1 overflow-y-auto p-3 bg-white"
      >
        {headings.length > 0 ? (
          headings.map((item) => (
            <TOCItem
              key={item.id}
              item={item}
              onHeadingClick={scrollToHeading}
              expandedItems={expandedItems}
              toggleExpanded={toggleExpanded}
              activeId={activeHeadingId}
            />
          ))
        ) : (
          <div className="p-4 text-center text-stone-500 text-sm">
            {t("markdownTOC.noHeadings")}
          </div>
        )}
      </div>
    </div>
  );
};

MarkdownTOC.propTypes = {
  markdownContent: PropTypes.string.isRequired,
  onHeadingClick: PropTypes.func,
};

export default MarkdownTOC;

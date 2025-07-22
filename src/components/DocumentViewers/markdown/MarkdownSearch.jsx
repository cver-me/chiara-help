import { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Search result item that displays a content preview with highlighted match
 */
const SearchResultItem = ({ result, onClick, isActive }) => {
  const {
    text,
    line,
    matchStart,
    matchEnd,
    contextBefore,
    contextAfter,
    surroundingLines,
    paragraphStart,
    paragraphEnd,
  } = result;

  return (
    <div
      className={`p-2.5 border-b border-stone-100 cursor-pointer transition-colors duration-200 ease-in-out ${
        isActive ? "bg-stone-100" : ""
      } hover:bg-stone-50`}
      onClick={() => onClick(result)}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-stone-500">
          Line {line}
          {paragraphStart !== paragraphEnd &&
            `(para ${paragraphStart}-${paragraphEnd})`}
        </span>
      </div>
      <div className="text-sm mb-1">
        <span className="text-stone-500">{contextBefore}</span>
        <span className="font-medium text-stone-900 bg-yellow-100 px-0.5 rounded">
          {text.substring(matchStart, matchEnd)}
        </span>
        <span className="text-stone-500">{contextAfter}</span>
      </div>

      {/* Show a snippet of surrounding context */}
      {surroundingLines && surroundingLines.length > 0 && (
        <div className="text-xs text-stone-400 mt-1 border-l-2 border-stone-200 pl-2 line-clamp-2 italic">
          {surroundingLines.slice(0, 2).join(" ")}
        </div>
      )}
    </div>
  );
};

SearchResultItem.propTypes = {
  result: PropTypes.shape({
    text: PropTypes.string.isRequired,
    line: PropTypes.number.isRequired,
    matchStart: PropTypes.number.isRequired,
    matchEnd: PropTypes.number.isRequired,
    contextBefore: PropTypes.string.isRequired,
    contextAfter: PropTypes.string.isRequired,
    element: PropTypes.string,
    matchText: PropTypes.string,
    surroundingLines: PropTypes.arrayOf(PropTypes.string),
    paragraphStart: PropTypes.number,
    paragraphEnd: PropTypes.number,
    occurrenceInLine: PropTypes.number.isRequired,
  }).isRequired,
  onClick: PropTypes.func.isRequired,
  isActive: PropTypes.bool,
};

/**
 * Markdown Search component that enables searching within markdown content
 */
const MarkdownSearch = ({ markdownContent, onResultClick }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Focus the search input when component mounts
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Debounced search function
  const debouncedSearch = useCallback(
    (term) => {
      // Clear any existing timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (!term || !markdownContent) {
        setResults([]);
        setActiveResultIndex(-1);
        setIsSearching(false);
        return;
      }

      // Set searching indicator
      setIsSearching(true);

      // Set a timeout for the actual search
      searchTimeoutRef.current = setTimeout(() => {
        // Split content into lines for line number reference
        const lines = markdownContent.split("\n");
        const searchResults = [];

        // Function to get context around a match
        const getContext = (line, matchStart, matchEnd, contextLength = 20) => {
          const contextBefore = line.substring(
            Math.max(0, matchStart - contextLength),
            matchStart
          );

          const contextAfter = line.substring(
            matchEnd,
            Math.min(line.length, matchEnd + contextLength)
          );

          return { contextBefore, contextAfter };
        };

        // Search each line for matches
        lines.forEach((line, lineIndex) => {
          const searchRegex = new RegExp(
            term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "gi" // Always case insensitive
          );

          let match;
          let occurrenceCounter = 0; // Initialize counter for this line
          while ((match = searchRegex.exec(line)) !== null) {
            const matchStart = match.index; // Offset within this specific line
            const matchEnd = match.index + match[0].length;
            const { contextBefore, contextAfter } = getContext(
              line,
              matchStart,
              matchEnd
            );

            // Calculate surrounding paragraph boundaries for better context
            const paragraphStart = Math.max(0, lineIndex - 2);
            const paragraphEnd = Math.min(lines.length - 1, lineIndex + 2);

            // Get surrounding lines to help identify the paragraph content
            const surroundingLines = [];
            for (let i = paragraphStart; i <= paragraphEnd; i++) {
              if (i !== lineIndex) {
                // Don't include the matching line itself
                surroundingLines.push(lines[i]);
              }
            }

            searchResults.push({
              text: line, // The full line text
              line: lineIndex + 1, // Line number (1-based)
              matchStart, // Offset within the line (we might not need this anymore for highlighting)
              matchEnd, // Offset within the line (we might not need this anymore for highlighting)
              contextBefore,
              contextAfter,
              // Enhanced targeting info
              element: `md-line-${lineIndex + 1}`, // Still useful for finding the block
              matchText: match[0], // The exact text that was matched
              occurrenceInLine: occurrenceCounter, // The index of this match within the line
              surroundingLines,
              paragraphStart: paragraphStart + 1, // 1-indexed
              paragraphEnd: paragraphEnd + 1, // 1-indexed
            });

            occurrenceCounter++; // Increment for the next potential match on the same line
          }
        });

        setResults(searchResults);
        setActiveResultIndex(searchResults.length > 0 ? 0 : -1);
        setIsSearching(false);
      }, 300); // 300ms debounce delay
    },
    [markdownContent]
  );

  // Search the markdown content when search term changes
  useEffect(() => {
    debouncedSearch(searchTerm);

    // Cleanup function to clear the timeout if component unmounts
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, debouncedSearch]);

  // Handle clicking on next/previous result buttons
  const navigateResults = (direction) => {
    if (results.length === 0) return;

    let newIndex;
    if (direction === "next") {
      newIndex =
        activeResultIndex < results.length - 1 ? activeResultIndex + 1 : 0;
    } else {
      newIndex =
        activeResultIndex > 0 ? activeResultIndex - 1 : results.length - 1;
    }

    setActiveResultIndex(newIndex);
    if (onResultClick && results[newIndex]) {
      onResultClick(results[newIndex]);
    }
  };

  // Handle clicking a specific result
  const handleResultClick = (result) => {
    // Find index based on line and *occurrence* now, more specific
    const index = results.findIndex(
      (r) =>
        r.line === result.line && r.occurrenceInLine === result.occurrenceInLine
    );
    if (index !== -1) {
      setActiveResultIndex(index);
    }
    if (onResultClick) {
      onResultClick(result);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm("");
    setResults([]);
    setActiveResultIndex(-1);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  return (
    <div className="markdown-search flex flex-col h-full">
      {/* Search input */}
      <div className="search-input-container p-3 border-b border-stone-200 bg-white">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("markdownSearch.searchPlaceholder")}
            className="w-full py-1.5 pl-8 pr-8 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 text-sm transition-all duration-200 ease-in-out"
          />
          <Search
            size={16}
            className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-stone-400"
          />
          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors duration-200"
              aria-label={t("markdownSearch.clearSearch")}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Search options and result count */}
      <div className="search-options flex items-center justify-end px-3 py-1.5 border-b border-stone-200 bg-stone-50">
        <div className="result-count text-xs text-stone-500">
          {isSearching
            ? t("markdownSearch.searching")
            : results.length > 0
              ? t("markdownSearch.matchCount", {
                  current: activeResultIndex + 1,
                  total: results.length,
                })
              : searchTerm
                ? t("markdownSearch.noMatches")
                : ""}
        </div>

        <div className="result-navigation flex ml-2">
          <button
            onClick={() => navigateResults("prev")}
            disabled={results.length === 0}
            className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-100 text-stone-500 transition-colors duration-200"
            aria-label={t("markdownSearch.previousResult")}
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => navigateResults("next")}
            disabled={results.length === 0}
            className="p-1 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-100 text-stone-500 transition-colors duration-200"
            aria-label={t("markdownSearch.nextResult")}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Search results */}
      <div className="search-results flex-1 overflow-y-auto bg-white">
        {results.length > 0 ? (
          results.map((result, index) => (
            <SearchResultItem
              key={`${result.line}-${result.matchStart}`}
              result={result}
              onClick={handleResultClick}
              isActive={index === activeResultIndex}
            />
          ))
        ) : searchTerm ? (
          <div className="p-4 text-center text-stone-500 text-sm">
            {t("markdownSearch.noResults", { searchTerm })}
          </div>
        ) : (
          <div className="p-4 text-center text-stone-500 text-sm">
            {t("markdownSearch.typeToSearch")}
          </div>
        )}
      </div>
    </div>
  );
};

MarkdownSearch.propTypes = {
  markdownContent: PropTypes.string.isRequired,
  onResultClick: PropTypes.func.isRequired,
};

export default MarkdownSearch;

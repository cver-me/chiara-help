/**
 * Utilities for handling search results and text highlighting
 */

// Add a mapping cache at the top of the file
// This will store relationships between line numbers and DOM elements
const lineToElementCache = new Map();

// Add a function to build the initial mapping
function buildElementMapping() {
  // Only build the mapping if it's empty
  if (lineToElementCache.size === 0) {
    console.log("Building line-to-element mapping cache");

    // Find all content blocks
    const contentBlocks = document.querySelectorAll(".md-content-block");

    // Process each block to map line numbers to elements
    contentBlocks.forEach((element) => {
      const startLine = parseInt(element.getAttribute("data-start-line"), 10);
      const endLine = parseInt(element.getAttribute("data-end-line"), 10);

      // Skip if we couldn't get valid line numbers
      if (isNaN(startLine) || isNaN(endLine)) return;

      // Map each line in this element's range to this element
      for (let line = startLine; line <= endLine; line++) {
        lineToElementCache.set(line, element);
      }
    });

    console.log(`Cached ${lineToElementCache.size} line mappings`);
  }
}

/**
 * Removes any existing search highlights from the document
 */
export const removeExistingHighlights = () => {
  const existingHighlights = document.querySelectorAll(
    ".search-match-highlight"
  );
  existingHighlights.forEach((el) => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
};

/**
 * Creates a highlight overlay element with improved styling
 * @returns {HTMLElement} - The created highlight overlay element
 */
export const createHighlightOverlay = () => {
  const highlightOverlay = document.createElement("div");
  highlightOverlay.className = "search-match-highlight";
  highlightOverlay.style.position = "absolute";
  highlightOverlay.style.backgroundColor = "rgba(255, 213, 0, 0.4)"; // More visible yellow
  highlightOverlay.style.borderRadius = "2px";
  highlightOverlay.style.pointerEvents = "none";
  highlightOverlay.style.zIndex = "100";
  highlightOverlay.style.boxShadow = "0 0 0 2px rgba(255, 213, 0, 0.6)"; // Add outline
  highlightOverlay.style.animation = "fade-highlight 3s ease-out forwards"; // Longer animation

  document.body.appendChild(highlightOverlay);
  return highlightOverlay;
};

/**
 * Finds elements containing a specific line number
 * @param {number} line - The line number to search for
 * @returns {Array} - Array of elements containing the line
 */
export const findElementsWithLine = (line) => {
  const elements = document.querySelectorAll(
    `.md-content-block[data-start-line="${line}"], .md-content-block[data-end-line="${line}"]`
  );

  if (elements.length > 0) {
    // Sort by how close they match the search result's line
    return Array.from(elements).sort((a, b) => {
      const aStartLine = parseInt(a.getAttribute("data-start-line"), 10);
      const bStartLine = parseInt(b.getAttribute("data-start-line"), 10);

      const aStartDiff = Math.abs(aStartLine - line);
      const bStartDiff = Math.abs(bStartLine - line);

      return aStartDiff - bStartDiff;
    });
  }

  return [];
};

/**
 * Finds all visible text nodes within an element.
 * @param {HTMLElement} element - The element to search in
 * @returns {Array<Text>} - Array of text nodes
 */
export const findTextNodes = (element) => {
  const textNodes = [];
  // Use TreeWalker to efficiently find all text nodes
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT, // Only interested in text nodes
    null, // No custom filter
    false // Don't need entity references
  );

  let node;
  while ((node = walker.nextNode())) {
    // Basic visibility check on the parent element
    const parentElement = node.parentElement;
    if (parentElement) {
      const style = window.getComputedStyle(parentElement);
      if (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        node.textContent?.trim() // Ignore nodes with only whitespace
      ) {
        textNodes.push(node);
      }
    } else {
      // If no parent, maybe it's directly under the searched element
      // Include it if it has non-whitespace content
      if (node.textContent?.trim()) {
        textNodes.push(node);
      }
    }
  }
  return textNodes;
};

/**
 * Positions a highlight overlay over a text range
 * @param {HTMLElement} overlay - The highlight overlay element
 * @param {Text} textNode - The text node containing the match
 * @param {number} start - Start index of the match
 * @param {number} end - End index of the match
 */
export const positionHighlightOverlay = (overlay, textNode, start, end) => {
  try {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);

    const rect = range.getBoundingClientRect();

    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  } catch (err) {
    console.error("Error positioning highlight overlay:", err);
  }
};

/**
 * Applies a temporary background highlight to an element
 * @param {HTMLElement} element - The element to highlight
 * @param {string} color - The highlight color (CSS color value)
 * @param {number} duration - Duration of the highlight in milliseconds
 */
export const applyTemporaryHighlight = (
  element,
  color = "rgba(255, 213, 0, 0.3)",
  duration = 2000
) => {
  const originalBackground = element.style.backgroundColor;
  element.style.backgroundColor = color;
  element.style.transition = "background-color 1s ease";

  setTimeout(() => {
    element.style.backgroundColor = originalBackground;
  }, duration);
};

/**
 * Finds the closest element to a specific line number
 * @param {number} line - The target line number
 * @returns {HTMLElement|null} - The closest element or null if none found
 */
export const findClosestElementByLine = (line) => {
  const allContentBlocks = document.querySelectorAll(".md-content-block");

  if (allContentBlocks.length > 0) {
    let closestElement = null;
    let minDistance = Number.MAX_SAFE_INTEGER;

    allContentBlocks.forEach((el) => {
      const startLine = parseInt(el.getAttribute("data-start-line"), 10);
      if (!isNaN(startLine)) {
        const distance = Math.abs(startLine - line);
        if (distance < minDistance) {
          minDistance = distance;
          closestElement = el;
        }
      }
    });

    return closestElement;
  }

  return null;
};

/**
 * Navigate to a search result with improved positioning
 * @param {Object} result The search result object
 */
export const navigateToSearchResult = async (result) => {
  try {
    // First ensure our mapping is built
    buildElementMapping();

    // Remove any existing highlights first
    removeExistingHighlights();

    // Look up the element directly from our cache
    let element = lineToElementCache.get(result.line);

    if (element) {
      // console.log("Found element from line cache:", result.line);
    } else {
      // If not in cache, try ID as fallback (much less common now)
      element = document.getElementById(result.element);

      if (element) {
        console.log("Found element by ID (fallback)");

        // Update our cache with this mapping for future use
        const startLine = parseInt(element.getAttribute("data-start-line"), 10);
        const endLine = parseInt(element.getAttribute("data-end-line"), 10);

        if (!isNaN(startLine) && !isNaN(endLine)) {
          for (let line = startLine; line <= endLine; line++) {
            lineToElementCache.set(line, element);
          }
        }
      } else {
        console.log("Element not found by cache or ID, using content fallback");

        // Text matching fallback for when structural approaches fail
        const matchText =
          result.matchText ||
          result.text.substring(result.matchStart, result.matchEnd);
        const allContentBlocks = document.querySelectorAll(".md-content-block");

        for (const block of allContentBlocks) {
          if (block.textContent.includes(matchText)) {
            element = block;
            break;
          }
        }
      }
    }

    // If we found an element by any method, scroll and then highlight
    if (element) {
      // Scroll to the element and WAIT for the scroll to likely finish
      await scrollToElement(element);

      // NOW apply the highlight after scrolling
      highlightSearchResult(element, result);
    } else {
      console.warn(
        "Could not find any matching element for search result:",
        result
      );

      // Use text-based fallback search as last resort
      const matchText =
        result.matchText ||
        result.text.substring(result.matchStart, result.matchEnd);

      // Find the paragraph with the most text overlap (abbreviated version)
      const allParagraphs = document.querySelectorAll(
        "p, li, h1, h2, h3, h4, h5, h6"
      );
      let bestMatch = null;

      for (const para of allParagraphs) {
        if (para.textContent.includes(matchText)) {
          bestMatch = para;
          break;
        }
      }

      if (bestMatch) {
        // Scroll to the paragraph and WAIT for the scroll to likely finish
        await scrollToElement(bestMatch);
        highlightSearchResult(bestMatch, result);
      } else {
        // Last resort - approximate by line ratio
        const scrollContainer = document.querySelector(".h-full.overflow-auto");

        if (scrollContainer) {
          const totalLines = 1000; // Approximate
          const lineRatio = result.line / totalLines;
          const totalHeight = scrollContainer.scrollHeight;
          const approxPosition = lineRatio * totalHeight;

          scrollContainer.scrollTo({
            top: Math.max(0, approxPosition - 100),
            behavior: "smooth",
          });
        }
      }
    }
  } catch (error) {
    console.error("Error navigating to search result:", error);
  }
};

/**
 * Scroll to an element with improved positioning and return a Promise that resolves after the scroll likely finishes.
 * @param {HTMLElement} element - The element to scroll to
 * @returns {Promise<void>} A promise that resolves after a short delay to allow smooth scrolling.
 */
function scrollToElement(element) {
  return new Promise((resolve) => {
    try {
      // Use the same container selection approach as TOC navigation
      const scrollContainer =
        document.querySelector(".h-full.overflow-auto") ||
        document.documentElement;

      // Get the element position
      const elementRect = element.getBoundingClientRect();

      // Get the container position (or use viewport if documentElement)
      const containerRect = scrollContainer.getBoundingClientRect();

      // Calculate scroll margin for headers/navigation
      const scrollMargin = 80; // Adjust as needed based on fixed headers

      // Calculate the element's position relative to the scroll container's top
      const elementTopRelativeToContainer = elementRect.top - containerRect.top;

      // Calculate the target scroll position to bring the element near the top
      const targetScrollTop =
        scrollContainer.scrollTop +
        elementTopRelativeToContainer -
        scrollMargin;

      // Check if element is already roughly in the target position (within a tolerance range)
      const currentPositionFromTop = elementTopRelativeToContainer;
      const targetPositionFromTop = scrollMargin; // The ideal final position from the container's top
      const positionTolerance = 50; // Increased tolerance

      let needsScroll = true;
      if (
        Math.abs(currentPositionFromTop - targetPositionFromTop) <=
        positionTolerance
      ) {
        // Element is already close to the target, no smooth scroll needed
        needsScroll = false;
        // console.log("Element already in view, skipping smooth scroll.");
      }

      if (needsScroll) {
        // Apply the scroll smoothly
        scrollContainer.scrollTo({
          top: Math.max(0, targetScrollTop), // Ensure we don't scroll past the top
          behavior: "smooth",
        });
        // Resolve after a delay slightly longer than typical smooth scroll
        setTimeout(resolve, 400);
      } else {
        // If no scroll needed, resolve immediately
        resolve();
      }

      // Removed the older verification setTimeout logic as the promise handles the delay.
    } catch (error) {
      console.error("Error in scrollToElement:", error);
      // Simple fallback scroll - doesn't guarantee position but better than nothing
      element.scrollIntoView({
        behavior: "auto", // Use auto here as smooth might fail again
        block: "center",
      });
      // Resolve after a short delay even on error/fallback
      setTimeout(resolve, 100);
    }
  });
}

/**
 * Tries to highlight the Nth occurrence from a specific original line within a potentially multi-line element.
 * Attempts to map line/occurrence index to the element's textContent structure.
 * @param {HTMLElement} element - The block element containing the result.
 * @param {Object} result - Search result object { line, occurrenceInLine, matchText, ... }.
 */
function highlightSearchResult(element, result) {
  try {
    const { line, occurrenceInLine, matchText } = result;

    if (
      typeof line !== "number" ||
      typeof occurrenceInLine !== "number" ||
      !matchText
    ) {
      console.warn("highlightSearchResult: Invalid result object.", result);
      return;
    }

    const elementStartLine = parseInt(
      element.getAttribute("data-start-line"),
      10
    );
    if (isNaN(elementStartLine)) {
      console.warn(
        "highlightSearchResult: Element missing data-start-line.",
        element
      );
      // Fallback to simpler highlighting if line info is missing
      highlightFirstMatchFallback(element, matchText);
      return;
    }

    const elementTextContent = element.textContent || "";
    const searchTermLower = matchText.toLowerCase();
    let targetGlobalOffset = -1; // The offset of the match start within element.textContent

    // --- Strategy: Find the offset within element.textContent ---
    // 1. Find the start index of the target line within the element's text content.
    let lineStartIndex = 0;
    let searchAreaStart = 0;
    let searchAreaEnd = elementTextContent.length;

    // Iterate through newlines in the element's text to find the start of our target line
    if (line > elementStartLine) {
      let newlineCount = line - elementStartLine;
      let lastNewlineIndex = -1;
      while (newlineCount > 0) {
        let nextNewline = elementTextContent.indexOf(
          "\n",
          lastNewlineIndex + 1
        );
        if (nextNewline === -1) {
          // Not enough newlines found, indicates potential issue or end of content
          console.warn(
            `Expected ${line - elementStartLine} newlines in element content, but found fewer.`
          );
          break; // Exit loop, will likely fallback later
        }
        lastNewlineIndex = nextNewline;
        newlineCount--;
      }
      if (lastNewlineIndex !== -1) {
        lineStartIndex = lastNewlineIndex + 1; // Start of our target line
      } else if (line > elementStartLine) {
        // Could not find the start of the target line via newlines
        console.warn(
          `Could not find start offset for line ${line} within element starting at ${elementStartLine}`
        );
        // Fallback needed
        targetGlobalOffset = -2; // Use a specific value to signal fallback later
      }
    }
    searchAreaStart = lineStartIndex;

    // 2. Find the end index of the target line within the element's text content.
    let lineEndIndex = elementTextContent.indexOf("\n", lineStartIndex);
    if (lineEndIndex === -1) {
      lineEndIndex = elementTextContent.length; // If no newline, it's the last line
    }
    searchAreaEnd = lineEndIndex;

    // 3. Search for the Nth occurrence within that specific line's text range.
    if (targetGlobalOffset !== -2) {
      // Only search if we found the line range
      let countInLine = 0;
      let searchPos = searchAreaStart;
      let foundIndex = -1;

      while (searchPos < searchAreaEnd) {
        foundIndex = elementTextContent
          .toLowerCase()
          .indexOf(searchTermLower, searchPos);
        // Ensure the found index is within the calculated line boundaries
        if (foundIndex === -1 || foundIndex >= searchAreaEnd) {
          break; // No more matches found within this line's range
        }

        if (countInLine === occurrenceInLine) {
          targetGlobalOffset = foundIndex; // Found the correct match offset!
          break;
        }

        countInLine++;
        searchPos = foundIndex + 1; // Continue searching after this match
      }

      if (targetGlobalOffset === -1) {
        console.warn(
          `Did not find occurrence ${occurrenceInLine} of "${matchText}" within calculated line range (${searchAreaStart}-${searchAreaEnd}).`
        );
        // Proceed to fallback
      }
    }

    // --- Strategy: Map global offset to DOM Text Node ---
    const textNodes = findTextNodes(element);
    let cumulativeLength = 0;
    let matchDomFound = false;
    const overlay = createHighlightOverlay(); // Create overlay (will be removed if not used)

    if (targetGlobalOffset >= 0 && textNodes.length > 0) {
      for (const textNode of textNodes) {
        const nodeText = textNode.textContent || "";
        const nodeLength = nodeText.length;

        // Check if the target offset falls within this node
        if (
          targetGlobalOffset >= cumulativeLength &&
          targetGlobalOffset < cumulativeLength + nodeLength
        ) {
          const startInNode = targetGlobalOffset - cumulativeLength;
          const endInNode = startInNode + matchText.length;

          // Basic check: ensure endInNode doesn't exceed node length
          if (endInNode <= nodeLength) {
            // Optional: Verify the text matches at this position
            // const actualText = nodeText.substring(startInNode, endInNode);
            // if (actualText.toLowerCase() === searchTermLower) {
            positionHighlightOverlay(overlay, textNode, startInNode, endInNode);
            matchDomFound = true;
            break; // Found and highlighted
            // } else { console.warn(... mismatch warning ...); }
          } else {
            console.warn(
              `Calculated highlight range [${startInNode}-${endInNode}] exceeds node length ${nodeLength}.`
            );
          }
        }

        cumulativeLength += nodeLength;
        // Optimization: If we've passed the offset, stop checking
        if (cumulativeLength > targetGlobalOffset && !matchDomFound) {
          // console.log("Cumulative length exceeded target offset without finding node.");
          break;
        }
      }
    }

    // --- Fallback or Cleanup ---
    if (!matchDomFound) {
      // If the complex logic failed or wasn't attempted, remove the overlay we created...
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      // ...and try the simple fallback.
      console.warn(
        `Complex highlight failed for line ${line}, occurrence ${occurrenceInLine}. Falling back to first match.`
      );
      highlightFirstMatchFallback(element, matchText);
    }
  } catch (error) {
    console.error("Error in highlightSearchResult:", error);
    // Cleanup any potential overlay on error
    const orphanOverlay = document.querySelector(".search-match-highlight");
    if (orphanOverlay?.parentNode) {
      orphanOverlay.parentNode.removeChild(orphanOverlay);
    }
  }
}

/**
 * Fallback highlighter: Highlights the very first occurrence found in the element.
 * @param {HTMLElement} element
 * @param {string} matchText
 */
function highlightFirstMatchFallback(element, matchText) {
  try {
    const textNodes = findTextNodes(element);
    const searchTermLower = matchText.toLowerCase();
    let fallbackMatchFound = false;

    if (textNodes.length > 0) {
      const overlay = createHighlightOverlay();
      for (const textNode of textNodes) {
        const nodeText = textNode.textContent || "";
        const nodeTextLower = nodeText.toLowerCase();
        const indexInNode = nodeTextLower.indexOf(searchTermLower);

        if (indexInNode !== -1) {
          positionHighlightOverlay(
            overlay,
            textNode,
            indexInNode,
            indexInNode + matchText.length
          );
          fallbackMatchFound = true;
          break; // Found the first one
        }
      }
      // Cleanup if fallback also failed
      if (!fallbackMatchFound && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  } catch (fallbackError) {
    console.error("Error during fallback highlighting:", fallbackError);
  }
}

// Any other existing functions...

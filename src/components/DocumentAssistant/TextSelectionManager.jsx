import { useEffect, useCallback } from "react";
import PropTypes from "prop-types";

const TextSelectionManager = ({ containerRef, onSelectionChange }) => {
  // Simplified selection handler
  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const selectionText = selection.toString().trim();

    // Check if there's text selected within our container
    if (
      selectionText &&
      containerRef.current &&
      containerRef.current.contains(selection.anchorNode)
    ) {
      onSelectionChange(selectionText);
    } else if (!selectionText) {
      onSelectionChange(null);
    }
  }, [containerRef, onSelectionChange]);

  // Add event listeners
  useEffect(() => {
    const currentContainer = containerRef.current;

    if (currentContainer) {
      // Handle selection events - remove unnecessary setTimeout
      const handleMouseUp = () => handleSelection();
      const handleKeyUp = (e) => {
        // Handle selection via keyboard (arrow keys with shift, etc.)
        if (e.shiftKey) {
          handleSelection();
        }

        // Clear selection on Escape
        if (e.key === "Escape") {
          window.getSelection().removeAllRanges();
          onSelectionChange(null);
        }
      };

      // Add listeners
      currentContainer.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("keyup", handleKeyUp);

      // Listen for clicks outside to clear selection
      const handleGlobalMouseDown = (e) => {
        // If clicking outside container, check if selection should be cleared
        if (currentContainer && !currentContainer.contains(e.target)) {
          // Use requestAnimationFrame to handle this after the current event
          requestAnimationFrame(() => {
            const selection = window.getSelection();
            if (!selection || selection.toString().trim() === "") {
              onSelectionChange(null);
            }
          });
        }
      };

      window.addEventListener("mousedown", handleGlobalMouseDown);

      // Clean up
      return () => {
        currentContainer.removeEventListener("mouseup", handleMouseUp);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("mousedown", handleGlobalMouseDown);
      };
    }
  }, [containerRef, handleSelection, onSelectionChange]);

  // This component doesn't render anything
  return null;
};

TextSelectionManager.propTypes = {
  containerRef: PropTypes.shape({
    current: PropTypes.instanceOf(Element),
  }).isRequired,
  onSelectionChange: PropTypes.func.isRequired,
};

export default TextSelectionManager;

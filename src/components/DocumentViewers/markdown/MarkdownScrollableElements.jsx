import { useEffect, useRef } from "react";
import PropTypes from "prop-types";

/**
 * ScrollableTable - Creates a horizontally scrollable container for tables on mobile devices
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Table content to be wrapped
 * @returns {JSX.Element} - Scrollable table container
 */
export const ScrollableTable = ({ children, ...props }) => {
  const tableRef = useRef(null);
  const containerRef = useRef(null);

  // Check if table is wider than its container
  useEffect(() => {
    if (tableRef.current && containerRef.current) {
      const checkScroll = () => {
        // We don't need to track if scrolling is needed since we removed the indicator
        // Just keeping the resize listener for future extensibility
      };

      checkScroll();

      // Also check on window resize
      window.addEventListener("resize", checkScroll);
      return () => window.removeEventListener("resize", checkScroll);
    }
  }, []);

  return (
    <div ref={containerRef} className="scrollable-table-container">
      <table ref={tableRef} {...props}>
        {children}
      </table>
    </div>
  );
};

ScrollableTable.propTypes = {
  children: PropTypes.node,
};

/**
 * ScrollableMath - Creates a horizontally scrollable container for LaTeX math expressions
 *
 * @param {Object} props - Component props
 * @param {string} props.value - The math expression content
 * @param {boolean} props.inline - Whether the math is inline or block
 * @returns {JSX.Element} - Scrollable math container or inline math span
 */
export const ScrollableMath = ({ value, inline }) => {
  const mathRef = useRef(null);
  const containerRef = useRef(null);

  // Check if math expression is wider than its container
  useEffect(() => {
    // Only check for block math
    if (!inline && mathRef.current && containerRef.current) {
      const checkScroll = () => {
        // We don't need to track if scrolling is needed since we removed the indicator
        // Just keeping the resize listener for future extensibility
      };

      // Need setTimeout because KaTeX needs time to render
      setTimeout(checkScroll, 300);

      // Also check on window resize
      window.addEventListener("resize", checkScroll);
      return () => window.removeEventListener("resize", checkScroll);
    }
  }, [value, inline]);

  // Only add scrollable container for block math
  if (inline) {
    // Render inline math normally
    return <span className="math math-inline">{value}</span>;
  }

  return (
    <div ref={containerRef} className="scrollable-math">
      <div ref={mathRef} className="math math-display">
        {value}
      </div>
    </div>
  );
};

ScrollableMath.propTypes = {
  value: PropTypes.string.isRequired,
  inline: PropTypes.bool,
};

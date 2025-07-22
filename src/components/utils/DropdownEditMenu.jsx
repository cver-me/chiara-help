import React, { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { MoreHorizontal } from "lucide-react";
import eventBus from "../../utils/eventBus";

export const DropdownMenu = ({ children }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const dropdownId = useRef(Math.random().toString(36).substr(2, 9));

  // Update dropdown position when it opens or on scroll/resize
  useEffect(() => {
    const updatePosition = () => {
      if (dropdownOpen && triggerRef.current && dropdownRef.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const dropdownRect = dropdownRef.current.getBoundingClientRect();

        // Calculate position to keep dropdown within viewport
        let top = triggerRect.bottom + window.scrollY;
        let left = triggerRect.left + window.scrollX;

        // Check if dropdown would go below viewport
        if (top + dropdownRect.height > window.innerHeight) {
          top = triggerRect.top - dropdownRect.height + window.scrollY;
        }

        // Check if dropdown would go beyond right edge
        if (left + dropdownRect.width > window.innerWidth) {
          left = window.innerWidth - dropdownRect.width - 8;
        }

        dropdownRef.current.style.top = `${top}px`;
        dropdownRef.current.style.left = `${left}px`;
      }
    };

    if (dropdownOpen) {
      // Initial position
      requestAnimationFrame(updatePosition);

      // Update position on scroll or resize
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [dropdownOpen]);

  // Subscribe to dropdown events
  useEffect(() => {
    const unsubscribe = eventBus.subscribe("dropdown-opened", (openedId) => {
      if (openedId !== dropdownId.current && dropdownOpen) {
        setDropdownOpen(false);
      }
    });

    return () => unsubscribe();
  }, [dropdownOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  return (
    <div className="relative inline-flex" id={dropdownId.current}>
      {React.Children.map(children, (child) => {
        if (child.type === DropdownMenuTrigger) {
          return React.cloneElement(child, {
            ref: triggerRef,
            onClick: () => {
              setDropdownOpen(!dropdownOpen);
              eventBus.emit("dropdown-opened", dropdownId.current);
            },
          });
        }
        if (child.type === DropdownMenuContent) {
          return (
            dropdownOpen && (
              <div
                ref={dropdownRef}
                className="fixed z-50"
                style={{ visibility: dropdownOpen ? "visible" : "hidden" }}
              >
                {child}
              </div>
            )
          );
        }
        return child;
      })}
    </div>
  );
};

export const DropdownMenuTrigger = React.forwardRef(
  ({ children, asChild, onClick }, ref) => {
    return asChild ? (
      React.cloneElement(children, {
        ref,
        onClick: (e) => {
          e.stopPropagation();
          onClick?.();
        },
        "aria-haspopup": "true",
        "aria-expanded": false,
      })
    ) : (
      <button
        ref={ref}
        className="p-2 rounded-full hover:bg-gray-100"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        aria-haspopup="true"
        aria-expanded={false}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    );
  }
);

DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

export const DropdownMenuContent = ({ children, className = "" }) => {
  return (
    <div
      className={`min-w-[180px] overflow-hidden rounded-md border border-gray-200 bg-white p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95 ${className}`}
    >
      {children}
    </div>
  );
};

export const DropdownMenuItem = ({ children, onClick, className = "" }) => {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
};

DropdownMenu.propTypes = {
  children: PropTypes.node,
};

DropdownMenuTrigger.propTypes = {
  children: PropTypes.node,
  asChild: PropTypes.bool,
  onClick: PropTypes.func,
};

DropdownMenuContent.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
};

DropdownMenuItem.propTypes = {
  children: PropTypes.node,
  onClick: PropTypes.func,
  className: PropTypes.string,
};

export default DropdownMenu;

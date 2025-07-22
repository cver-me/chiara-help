import { useState, useEffect, useRef } from "react";
import { X, MoreVertical, Settings } from "lucide-react";
import PropTypes from "prop-types";

/**
 * ActionMenu component that displays actions as a bottom sheet on mobile
 * and as regular buttons with labels on desktop
 */
const ActionMenu = ({ primaryActions, secondaryActions, configActions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const menuRef = useRef(null);
  const sheetRef = useRef(null);
  const configDropdownRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close if clicking the toggle button
      if (event.target.closest('[data-menu-toggle="true"]')) {
        return;
      }

      // Close if clicking outside the menu
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }

      // Close config dropdown if clicking outside
      if (
        configDropdownRef.current &&
        !configDropdownRef.current.contains(event.target) &&
        !event.target.closest('[data-config-toggle="true"]')
      ) {
        setIsConfigOpen(false);
      }
    };

    if (isOpen || isConfigOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      // Only prevent scrolling for the mobile sheet
      if (isOpen) {
        document.body.style.overflow = "hidden";
      }
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "";
    };
  }, [isOpen, isConfigOpen]);

  // Handle escape key to close menu and config dropdown
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setIsConfigOpen(false);
      }
    };

    if (isOpen || isConfigOpen) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, isConfigOpen]);

  // No need for manual animation using DOM manipulation
  // We'll use CSS classes for animation instead

  // Toggle config dropdown
  const toggleConfigDropdown = () => {
    setIsConfigOpen(!isConfigOpen);
  };

  return (
    <div className="flex items-center" ref={menuRef}>
      {/* Mobile Menu Button - Only visible on small screens */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 rounded-lg hover:bg-stone-700 transition-colors"
        title="More options"
        data-menu-toggle="true"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {/* Mobile Bottom Sheet */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 md:hidden flex flex-col">
          <div
            className={`mt-auto bg-stone-800 text-white rounded-t-xl overflow-hidden transition-transform duration-300 ease-out ${
              isOpen ? "translate-y-0" : "translate-y-full"
            }`}
            ref={sheetRef}
          >
            {/* Handle indicator */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-stone-600 rounded-full"></div>
            </div>

            {/* Header with close button */}
            <div className="px-4 py-2 flex justify-between items-center border-b border-stone-700">
              <h3 className="text-sm font-medium">Options</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-stone-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* All action buttons including config actions */}
            <div className="px-2 py-2 max-h-[70vh] overflow-y-auto">
              {secondaryActions &&
                secondaryActions.map((action, index) => (
                  <div key={index} className="mb-1">
                    {action}
                  </div>
                ))}

              {configActions &&
                configActions.map((action, index) => (
                  <div key={index} className="mb-1">
                    {action}
                  </div>
                ))}
            </div>

            {/* Always-visible actions at the bottom with separator */}
            {primaryActions && primaryActions.length > 0 && (
              <div className="px-2 py-2 border-t border-stone-700">
                {primaryActions.map((action, index) => (
                  <div key={index} className="mb-1">
                    {action}
                  </div>
                ))}
              </div>
            )}

            {/* Safety padding at the bottom for better UX */}
            <div className="h-6"></div>
          </div>
        </div>
      )}

      {/* Desktop Layout - Hidden on mobile */}
      <div className="hidden md:flex items-center space-x-2">
        {/* Primary and Secondary Actions */}
        <div className="flex items-center gap-3">
          {secondaryActions}
          {primaryActions}
        </div>

        {/* Config Dropdown - Only if we have config actions */}
        {configActions && configActions.length > 0 && (
          <div className="relative ml-2" ref={configDropdownRef}>
            <button
              onClick={toggleConfigDropdown}
              className={`flex items-center p-2 text-sm font-medium rounded-lg hover:bg-stone-700 transition-colors ${isConfigOpen ? "bg-stone-700" : ""}`}
              title="Settings"
              data-config-toggle="true"
            >
              <Settings className="w-5 h-5" />
            </button>

            {isConfigOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-md shadow-lg bg-stone-800 ring-1 ring-black ring-opacity-5 z-50">
                <div className="py-1">
                  <div className="px-4 py-2 text-sm text-white font-medium border-b border-stone-700">
                    Settings
                  </div>
                  <div className="p-2">
                    {configActions.map((action, index) => (
                      <div key={index} className="mb-1">
                        {action}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

ActionMenu.propTypes = {
  primaryActions: PropTypes.arrayOf(PropTypes.node),
  secondaryActions: PropTypes.arrayOf(PropTypes.node),
  configActions: PropTypes.arrayOf(PropTypes.node),
};

export default ActionMenu;

import { Sparkles } from "lucide-react";
import PropTypes from "prop-types";

const AssistantPanelToggle = ({ onClick, isOpen }) => {
  // Create optimized click handler with preventDefault
  const handleClick = (e) => {
    e.preventDefault(); // Prevent any default behaviors
    // Apply button pressed visual feedback immediately
    e.currentTarget.style.transform = "scale(0.95)";

    // Execute the click handler
    onClick();

    // Reset button after short delay
    setTimeout(() => {
      if (e.currentTarget) e.currentTarget.style.transform = "";
    }, 150);
  };

  // If sidebar is open, don't render the button
  if (isOpen) return null;

  return (
    <button
      onClick={handleClick}
      className="fixed right-4 bottom-8 p-3 rounded-full z-20 transition-all duration-100
        hidden sm:block
        bg-gradient-to-r from-rose-400 via-fuchsia-400 to-indigo-400 text-white
        opacity-75 hover:opacity-100 active:opacity-100
        hover:from-rose-500 hover:via-fuchsia-500 hover:to-indigo-500
        active:from-rose-600 active:via-fuchsia-600 active:to-indigo-600
        shadow-xl border-2 border-stone"
      aria-label="Open document assistant"
      title="Document Assistant"
      style={{ willChange: "transform, background-color" }}
    >
      <Sparkles size={24} />
    </button>
  );
};

// PropTypes validation
AssistantPanelToggle.propTypes = {
  onClick: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
};

export default AssistantPanelToggle;

import PropTypes from "prop-types";
import { Loader2 } from "lucide-react";

const ProgressIndicator = ({ progress }) => {
  const { stage, status, percent, chunks } = progress;
  const isProcessing = status !== "error"; // Show spinner unless there's an error
  const isCompleted = status === "completed" && percent === 100; // Only fully complete when at 100%

  return (
    <div className="w-full p-4 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div className="text-lg font-semibold text-gray-800">{stage}</div>
          {!isCompleted && (
            <Loader2 className="w-5 h-5 text-stone-500 animate-spin" />
          )}
        </div>
        <div className="text-sm text-gray-600">{chunks}</div>
      </div>

      <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute h-full rounded-full transition-all duration-300 ${
            !isCompleted
              ? "bg-gradient-to-r from-blue-400 to-blue-600 animate-pulse"
              : status === "error"
                ? "bg-red-500"
                : "bg-blue-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className={`text-sm font-medium ${
            status === "error"
              ? "text-red-500"
              : !isCompleted
                ? "text-blue-500"
                : "text-green-500"
          }`}
        >
          {isCompleted
            ? "Complete"
            : status === "error"
              ? "Error"
              : "Processing..."}
        </span>
        <span className="text-sm text-gray-500">{percent}%</span>
      </div>
    </div>
  );
};

ProgressIndicator.propTypes = {
  progress: PropTypes.shape({
    stage: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    percent: PropTypes.number.isRequired,
    chunks: PropTypes.string.isRequired,
  }).isRequired,
};

export default ProgressIndicator;

import { FileText, FolderUp } from "lucide-react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const EmptyState = ({ type = "create", showButton = true, onCreateClick }) => {
  const { t } = useTranslation();
  const isUpload = type === "upload";

  return (
    <div className="mt-8 flex flex-col items-center justify-center py-12 px-6">
      {/* Simple icon in a light circular background */}
      <div className="mb-6 p-5 bg-stone-100 rounded-full">
        {isUpload ? (
          <FolderUp className="w-12 h-12 text-stone-500" />
        ) : (
          <FileText className="w-12 h-12 text-stone-500" />
        )}
      </div>

      {/* Text Content */}
      <h3 className="text-xl font-medium text-stone-800 mb-3 text-center">
        {isUpload ? t("emptyState.upload.title") : t("emptyState.create.title")}
      </h3>

      <p className="text-stone-500 mb-6 max-w-md text-center">
        {isUpload
          ? t("emptyState.upload.description")
          : t("emptyState.create.description")}
      </p>

      {/* Action Button - only shown if showButton is true */}
      {showButton &&
        (isUpload ? (
          <Link
            to="/study-material"
            className="px-6 py-2.5 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors duration-200 flex items-center gap-2 font-medium"
          >
            <FolderUp className="w-4 h-4" />
            <span>{t("emptyState.upload.button")}</span>
          </Link>
        ) : (
          <button
            onClick={onCreateClick}
            className="px-6 py-2.5 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors duration-200 flex items-center gap-2 font-medium"
          >
            <FileText className="w-4 h-4" />
            <span>{t("emptyState.create.button")}</span>
          </button>
        ))}
    </div>
  );
};

EmptyState.propTypes = {
  type: PropTypes.oneOf(["create", "upload"]),
  showButton: PropTypes.bool,
  onCreateClick: PropTypes.func,
};

export default EmptyState;

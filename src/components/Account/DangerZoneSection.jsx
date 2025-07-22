import { useState } from "react";
import PropTypes from "prop-types";
import {
  AlertTriangle,
  Loader2,
  X,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import toast from "../Toast";

// --- Inline Modal Component ---
const DeleteConfirmationModal = ({
  t,
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  feedbackMessage,
  setFeedbackMessage,
  confirmationInput,
  setConfirmationInput,
  confirmationError,
  feedbackStatus,
  feedbackError,
  requiredConfirmationPhrase,
}) => {
  if (!isOpen) return null;

  const handleConfirmClick = (e) => {
    e.preventDefault();
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 transition-opacity duration-300"
      aria-labelledby="delete-confirmation-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 scale-100 opacity-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2
            id="delete-confirmation-modal-title"
            className="text-lg font-medium text-red-800 flex items-center"
          >
            <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
            {t("account.dangerZone.modal.title")}
          </h2>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50 rounded-md p-1"
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-gray-700">
            {t("account.dangerZone.modal.description")}
          </p>

          {/* Optional Feedback */}
          <div>
            <label
              htmlFor="feedbackMessage"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("account.dangerZone.modal.feedbackLabel")}
            </label>
            <textarea
              id="feedbackMessage"
              rows="3"
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              placeholder={t("account.dangerZone.modal.feedbackPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-sm disabled:opacity-70 disabled:bg-gray-100"
              disabled={isDeleting || feedbackStatus === "sending"}
            />
            {feedbackStatus === "sending" && (
              <p className="text-xs text-gray-500 mt-1 flex items-center">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                {t("common.sending")}
              </p>
            )}
            {feedbackStatus === "error" && (
              <div className="mt-2 text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1.5 flex-shrink-0" />
                {t("account.dangerZone.modal.feedbackError")}{" "}
                {feedbackError || t("common.error.unknown")}
              </div>
            )}
            {feedbackStatus === "success" && (
              <div className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200 flex items-center">
                <CheckCircle className="w-4 h-4 mr-1.5 flex-shrink-0" />
                {t("account.dangerZone.modal.feedbackSuccess")}
              </div>
            )}
          </div>

          {/* Confirmation Input */}
          <div>
            <label
              htmlFor="confirmationInput"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("account.dangerZone.modal.confirmationLabel")}{" "}
              <strong className="text-red-700 font-semibold">
                `{requiredConfirmationPhrase}`
              </strong>
            </label>
            <input
              type="text"
              id="confirmationInput"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 text-sm disabled:opacity-70 disabled:bg-gray-100 ${
                confirmationError
                  ? "border-red-500 ring-red-500"
                  : "border-gray-300 focus:ring-red-500 focus:border-red-500"
              }`}
              disabled={isDeleting}
            />
            {confirmationError && (
              <p className="text-xs text-red-600 mt-1">{confirmationError}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={
              isDeleting ||
              confirmationInput !== requiredConfirmationPhrase ||
              feedbackStatus === "sending"
            }
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("account.dangerZone.deleting")}
              </>
            ) : (
              t("account.dangerZone.modal.confirmButton")
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

DeleteConfirmationModal.propTypes = {
  t: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  isDeleting: PropTypes.bool.isRequired,
  feedbackMessage: PropTypes.string.isRequired,
  setFeedbackMessage: PropTypes.func.isRequired,
  confirmationInput: PropTypes.string.isRequired,
  setConfirmationInput: PropTypes.func.isRequired,
  confirmationError: PropTypes.string,
  feedbackStatus: PropTypes.oneOf([null, "sending", "success", "error"]),
  feedbackError: PropTypes.string,
  requiredConfirmationPhrase: PropTypes.string.isRequired,
};

// --- Main Component ---
const DangerZoneSection = ({ t }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [confirmationInput, setConfirmationInput] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState(null);
  const [feedbackError, setFeedbackError] = useState("");

  const requiredConfirmationPhrase = t(
    "account.dangerZone.deleteConfirmationPhrase"
  );

  const handleOpenModal = () => {
    setDeleteError("");
    setFeedbackMessage("");
    setConfirmationInput("");
    setConfirmationError("");
    setFeedbackStatus(null);
    setFeedbackError("");
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isDeleting) return;
    setIsModalOpen(false);
  };

  const handleConfirmDeletion = async () => {
    setConfirmationError("");
    if (confirmationInput !== requiredConfirmationPhrase) {
      setConfirmationError(t("account.dangerZone.deleteConfirmationMismatch"));
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    let feedbackSentSuccessfully = false;
    if (feedbackMessage.trim()) {
      setFeedbackStatus("sending");
      setFeedbackError("");
      try {
        const functionsInstance = getFunctions();
        const sendFeedback = httpsCallable(
          functionsInstance,
          "sendFeedbackEmail"
        );
        const auth = getAuth();
        const user = auth.currentUser;

        const feedbackData = {
          message: feedbackMessage,
          feedbackType: "accountDeletionFeedback",
          userId: user?.uid || null,
          userEmail: user?.email || null,
          userAgent: navigator.userAgent,
          pageUrl: window.location.href,
        };

        const result = await sendFeedback(feedbackData);

        if (result.data.success) {
          setFeedbackStatus("success");
          feedbackSentSuccessfully = true;
        } else {
          throw new Error(
            result.data.error || t("supportModal.submitError.default")
          );
        }
      } catch (error) {
        console.error("Error sending deletion feedback:", error);
        setFeedbackStatus("error");
        setFeedbackError(
          error.message || t("supportModal.submitError.unexpected")
        );
      }
    } else {
      setFeedbackStatus(null);
    }

    try {
      const functionsInstance = getFunctions();
      const deleteUserAccountCallable = httpsCallable(
        functionsInstance,
        "deleteUserAccount"
      );
      await deleteUserAccountCallable();

      setIsModalOpen(false);
      toast.success(t("account.dangerZone.deleteSuccess"));
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error(t("account.dangerZone.deleteErrorGeneric"));
      setDeleteError(
        error?.message || t("account.dangerZone.deleteErrorGeneric")
      );
      setFeedbackStatus(null);
    } finally {
      if (
        deleteError ||
        (feedbackMessage.trim() &&
          feedbackStatus === "error" &&
          !feedbackSentSuccessfully)
      ) {
        setIsDeleting(false);
      }
      if (deleteError && feedbackStatus === "success") {
        // Intentionally keep success state visible
      } else if (deleteError) {
        setFeedbackStatus(null); // Clear feedback status if deletion failed and feedback wasn't success/error
      }
    }
  };

  return (
    <>
      <section
        id="danger-zone"
        className="bg-red-50 border border-red-200 rounded-lg p-6"
      >
        <h2 className="text-lg font-semibold text-red-800 mb-4 flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
          {t("account.dangerZone.title")}
        </h2>
        <p className="text-sm text-red-700 mb-4">
          {t("account.dangerZone.description")}
        </p>

        {deleteError && !isModalOpen && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-900 rounded-md text-sm">
            {deleteError}
          </div>
        )}

        <button
          type="button"
          onClick={handleOpenModal}
          disabled={isModalOpen || isDeleting}
          className={`
            inline-flex items-center justify-center px-4 py-2
            text-sm font-medium rounded-md
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500
            transition-colors duration-150 ease-in-out
            bg-red-600 text-white hover:bg-red-700
            disabled:bg-red-300 disabled:text-white disabled:cursor-not-allowed
          `}
        >
          {t("account.dangerZone.deleteButton")}
        </button>
        <p className="mt-3 text-xs text-red-600">
          {t("account.dangerZone.actionWarning")}
        </p>
      </section>

      <DeleteConfirmationModal
        t={t}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmDeletion}
        isDeleting={isDeleting}
        feedbackMessage={feedbackMessage}
        setFeedbackMessage={setFeedbackMessage}
        confirmationInput={confirmationInput}
        setConfirmationInput={setConfirmationInput}
        confirmationError={confirmationError}
        feedbackStatus={feedbackStatus}
        feedbackError={feedbackError}
        requiredConfirmationPhrase={requiredConfirmationPhrase}
      />
    </>
  );
};

DangerZoneSection.propTypes = {
  t: PropTypes.func.isRequired,
};

export default DangerZoneSection;

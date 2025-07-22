import React, { useState, useEffect } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../utils/firebase";
import {
  X,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Bug,
  Lightbulb,
  MessageSquare,
} from "lucide-react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

// Function to get Tailwind classes based on feedback type and selection status
const getTypeClasses = (info, isSelected) => {
  const baseClasses =
    "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer";
  const selectedClasses = `bg-stone-50 ${info.selectedBorder} ring-2 ring-offset-1 ${info.selectedRing}`;
  const unselectedClasses =
    "bg-white border-gray-200 hover:border-gray-400 hover:bg-gray-50";

  return `${baseClasses} ${isSelected ? selectedClasses : unselectedClasses}`;
};

const getIconWrapperClasses = (info, isSelected) => {
  const baseClasses =
    "w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors duration-200";
  const selectedClasses = info.selectedIconBg;
  const unselectedClasses = "bg-gray-100 group-hover:bg-gray-200";

  return `${baseClasses} ${isSelected ? selectedClasses : unselectedClasses}`;
};

const getIconClasses = (info, isSelected) => {
  const baseClasses = "w-5 h-5 transition-colors duration-200";
  const selectedClasses = info.selectedIconText;
  const unselectedClasses = "text-gray-500 group-hover:text-gray-600";

  return `${baseClasses} ${isSelected ? selectedClasses : unselectedClasses}`;
};

const SupportModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  // Define FEEDBACK_TYPES inside the component to access the t function
  const FEEDBACK_TYPES = {
    general: {
      name: t("supportModal.type.general.name"),
      icon: MessageSquare,
      colorName: "blue",
      description: t("supportModal.type.general.description"),
      selectedBorder: "border-blue-500",
      selectedRing: "ring-blue-300",
      selectedIconBg: "bg-blue-100",
      selectedIconText: "text-blue-600",
    },
    bug: {
      name: t("supportModal.type.bug.name"),
      icon: Bug,
      colorName: "red",
      description: t("supportModal.type.bug.description"),
      selectedBorder: "border-red-500",
      selectedRing: "ring-red-300",
      selectedIconBg: "bg-red-100",
      selectedIconText: "text-red-600",
    },
    idea: {
      name: t("supportModal.type.idea.name"),
      icon: Lightbulb,
      colorName: "yellow",
      description: t("supportModal.type.idea.description"),
      selectedBorder: "border-yellow-500",
      selectedRing: "ring-yellow-300",
      selectedIconBg: "bg-yellow-100",
      selectedIconText: "text-yellow-600",
    },
  };

  const [isVisible, setIsVisible] = useState(false);
  const [formData, setFormData] = useState({ message: "" });
  const [feedbackType, setFeedbackType] = useState("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setSubmitStatus(null);
    } else {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, message: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.message.trim()) {
      setSubmitStatus({
        success: false,
        message: t("supportModal.validationError.messageRequired"),
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const feedbackData = {
        message: formData.message,
        feedbackType,
        userId: user?.uid || null,
        userEmail: user?.email || null,
        userAgent: navigator.userAgent,
        pageUrl: window.location.href,
      };

      const sendFeedback = httpsCallable(functions, "sendFeedbackEmail");
      const result = await sendFeedback(feedbackData);

      if (result.data.success) {
        setSubmitStatus({
          success: true,
          message: t("supportModal.submitSuccess.title"),
        });
        setFormData({ message: "" });

        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setSubmitStatus({
          success: false,
          message: result.data.error || t("supportModal.submitError.default"),
        });
      }
    } catch (error) {
      console.error("Error sending feedback:", error);
      setSubmitStatus({
        success: false,
        message: error.message || t("supportModal.submitError.unexpected"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible && !isOpen) return null;

  const currentFeedbackInfo = FEEDBACK_TYPES[feedbackType];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      aria-labelledby="support-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div
        className={`relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 ${
          isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2
            id="support-modal-title"
            className="text-lg font-medium text-gray-900"
          >
            {t("supportModal.modalTitle")}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 rounded-md p-1"
            aria-label={t("supportModal.closeButtonLabel")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-800 mb-1">
              {t("supportModal.headerTitle")}
            </h3>
            <p className="text-sm text-gray-600">
              {t("supportModal.headerDescription")}
            </p>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("supportModal.feedbackTypeLabel")}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(FEEDBACK_TYPES).map(([type, info]) => {
                const isSelected = feedbackType === type;
                return (
                  <div
                    key={type}
                    onClick={() => !isSubmitting && setFeedbackType(type)}
                    className={`group ${getTypeClasses(info, isSelected)} ${isSubmitting ? "opacity-70 cursor-not-allowed" : ""}`}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={isSubmitting ? -1 : 0}
                    onKeyDown={(e) => {
                      if (
                        !isSubmitting &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        setFeedbackType(type);
                      }
                    }}
                  >
                    <div className={getIconWrapperClasses(info, isSelected)}>
                      {React.createElement(info.icon, {
                        className: getIconClasses(info, isSelected),
                        "aria-hidden": true,
                      })}
                    </div>
                    <span className="text-xs font-medium text-center text-gray-700 group-hover:text-gray-800">
                      {info.name}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <div className="flex items-start">
                <div>
                  <p className="text-sm text-gray-600">
                    {currentFeedbackInfo.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            {submitStatus?.success ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start text-sm">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <p className="text-green-800 font-medium">
                    {submitStatus.message}
                  </p>
                  <p className="text-green-700 mt-1">
                    {t("supportModal.submitSuccess.description")}
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    {t("supportModal.messageLabel")}
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows="5"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder={t("supportModal.messagePlaceholder", {
                      feedbackType:
                        FEEDBACK_TYPES[feedbackType].name.toLowerCase(),
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-500 focus:border-stone-500 text-sm disabled:opacity-70 disabled:bg-gray-50"
                    disabled={isSubmitting}
                    required
                  ></textarea>
                </div>

                {submitStatus?.success === false && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start text-sm">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" />
                    <p className="text-red-800">{submitStatus.message}</p>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex-shrink-0">
          {!submitStatus?.success && (
            <div className="flex justify-end">
              <button
                type="submit"
                form="feedback-form"
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.message.trim()}
                className="inline-flex items-center justify-center px-4 py-2 bg-stone-700 text-white rounded-md hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 transition-colors duration-200 shadow-sm text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("supportModal.sendingButton")}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {t("supportModal.sendButton")}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

SupportModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SupportModal;

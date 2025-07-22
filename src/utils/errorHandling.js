/**
 * Common error handling utilities
 */

/**
 * Get a user-friendly error message from various error types
 * @param {Error|Object|string} error - The error object or message
 * @returns {string} - A user-friendly error message
 */
export const getErrorMessage = (error) => {
  if (!error) {
    return "An unknown error occurred";
  }

  // Handle string errors
  if (typeof error === "string") {
    return error;
  }

  // Handle Firebase errors
  if (error.code) {
    // Common Firebase error codes
    const firebaseErrors = {
      "auth/user-not-found": "User not found. Please check your credentials.",
      "auth/wrong-password": "Invalid password. Please try again.",
      "auth/email-already-in-use":
        "Email already in use. Try signing in instead.",
      "auth/invalid-email": "Invalid email address format.",
      "auth/weak-password":
        "Password is too weak. Please use a stronger password.",
      "storage/object-not-found": "The requested file does not exist.",
      "storage/unauthorized": "You do not have permission to access this file.",
      "permission-denied": "You do not have permission to perform this action.",
    };

    return (
      firebaseErrors[error.code] || `Error: ${error.message || error.code}`
    );
  }

  // Handle general errors
  return error.message || "An unexpected error occurred";
};

/**
 * Creates a consistent error UI component
 * @param {string} message - The error message to display
 * @param {string} type - The error type ('error', 'warning', 'info')
 * @returns {Object} - A React component configuration for consistent error display
 */
export const createErrorDisplay = (message, type = "error") => {
  const baseClasses = "p-4 rounded-md my-4 text-sm";

  const typeClasses = {
    error: "bg-red-50 text-red-800 border border-red-200",
    warning: "bg-yellow-50 text-yellow-800 border border-yellow-200",
    info: "bg-sky-50 text-sky-800 border border-sky-200",
  };

  return {
    message,
    className: `${baseClasses} ${typeClasses[type] || typeClasses.error}`,
    icon:
      type === "error"
        ? "AlertCircle"
        : type === "warning"
          ? "AlertTriangle"
          : "Info",
  };
};

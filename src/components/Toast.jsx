import { toast as hotToast } from "react-hot-toast";

const toastOptions = {
  className: "bg-white text-gray-800 text-sm p-4 rounded-lg shadow-md border border-gray-200",
  success: {
    className: "bg-emerald-50 border-emerald-200",
    iconTheme: {
      primary: "#059669",
      secondary: "#ecfdf5",
    }
  },
  error: {
    className: "bg-red-50 border-red-200",
    iconTheme: {
      primary: "#dc2626",
      secondary: "#fef2f2",
    }
  }
};

const toast = {
  success: (message) => {
    hotToast.success(message, {
      duration: 3000,
      position: "bottom-right",
      ...toastOptions,
      ...toastOptions.success
    });
  },
  error: (message) => {
    hotToast.error(message, {
      duration: 4000,
      position: "bottom-right",
      ...toastOptions,
      ...toastOptions.error
    });
  },
  loading: (message) => {
    return hotToast.loading(message, {
      position: "bottom-right",
      ...toastOptions
    });
  },
  dismiss: () => {
    hotToast.dismiss();
  },
};

export default toast;

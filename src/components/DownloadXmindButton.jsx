import { useState } from "react";
import PropTypes from "prop-types";
import { FileEdit, X, Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFunctions, httpsCallable } from "firebase/functions";

// Helper function to decode Base64 and create Blob
function base64ToBlob(base64, contentType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

const XmindModal = ({ isOpen, onClose, onConfirm }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-md p-6 max-w-md w-full mx-4 relative">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-semibold text-gray-900 mb-3">
          {t("mindMapModal.downloadXmind.title")}
        </h2>

        <p className="text-sm text-gray-600 mb-6">
          {t("mindMapModal.downloadXmind.description")}
        </p>

        <div className="space-y-5">
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-4">
              <div className="h-12 w-12 bg-white text-stone-800 rounded-full flex items-center justify-center font-semibold text-xl border border-stone-200 shadow-sm">
                1
              </div>
            </div>
            <div className="flex-grow pt-2">
              <h3 className="font-medium text-base text-stone-800 mb-3">
                {t("mindMapModal.downloadXmind.downloadStep1")}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                <a
                  href="https://xmind.app/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 border border-stone-200 rounded-md text-center text-sm bg-stone-50 hover:bg-stone-100 transition-colors"
                >
                  Windows
                </a>
                <a
                  href="https://apps.apple.com/us/app/xmind-mind-map/id1327661892"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 border border-stone-200 rounded-md text-center text-sm bg-stone-50 hover:bg-stone-100 transition-colors"
                >
                  macOS
                </a>
                <a
                  href="https://apps.apple.com/us/app/xmind-mind-map-brainstorm/id1286983622"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 border border-stone-200 rounded-md text-center text-sm bg-stone-50 hover:bg-stone-100 transition-colors"
                >
                  iOS
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=net.xmind.doughnut&pcampaignid=web_share"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 border border-stone-200 rounded-md text-center text-sm bg-stone-50 hover:bg-stone-100 transition-colors"
                >
                  Android
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 mr-4">
              <div className="h-12 w-12 bg-white text-stone-800 rounded-full flex items-center justify-center font-semibold text-xl border border-stone-200 shadow-sm">
                2
              </div>
            </div>
            <div className="flex-grow pt-2">
              <h3 className="font-medium text-base text-stone-800">
                {t("mindMapModal.downloadXmind.downloadStep2")}
              </h3>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 mr-4">
              <div className="h-12 w-12 bg-white text-stone-800 rounded-full flex items-center justify-center font-semibold text-xl border border-stone-200 shadow-sm">
                3
              </div>
            </div>
            <div className="flex-grow pt-2">
              <h3 className="font-medium text-base text-stone-800">
                {t("mindMapModal.downloadXmind.openAndEdit")}
              </h3>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={onConfirm}
            className="w-full py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-900 transition-colors flex items-center justify-center gap-2 shadow-sm text-sm font-medium"
          >
            <Download className="h-5 w-5" />
            {t("mindMapModal.downloadXmind.downloadButton")}
          </button>
        </div>
      </div>
    </div>
  );
};

const DownloadXmindButton = ({ mermaidText, mindMapTitle = "MindMap" }) => {
  const { t } = useTranslation();
  const [isLoadingXmind, setIsLoadingXmind] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const functions = getFunctions();

  const handleDownloadXmind = async () => {
    if (!mermaidText) {
      console.error("Mermaid text is missing, cannot generate XMind file.");
      alert(t("mindMapModal.errors.downloadFailedGeneric"));
      return;
    }

    setIsLoadingXmind(true);

    // Add more detailed console logs for debugging
    console.log("[DownloadXmindButton] Debug info:", {
      mermaidTextLength: mermaidText.length,
      mermaidTextFirstLine: mermaidText.split("\n")[0],
      title: mindMapTitle || t("mindMapModal.defaultFilename"),
      hasContent: Boolean(mermaidText),
      contentType: typeof mermaidText,
    });

    try {
      // Ensure the function name matches the deployed function name
      const convertMermaidToXmind = httpsCallable(
        functions,
        "convertMermaidToXmind"
      );

      // Add console log for the exact data being sent
      const requestData = {
        mermaidText: mermaidText,
        title: mindMapTitle || t("mindMapModal.defaultFilename"),
      };

      console.log("[DownloadXmindButton] Sending request with:", {
        dataLength: JSON.stringify(requestData).length,
        mermaidTextLength: requestData.mermaidText.length,
        titleLength: requestData.title.length,
        firstLine: requestData.mermaidText.split("\n")[0],
      });

      const result = await convertMermaidToXmind(requestData);

      const base64Data = result.data.xmindData;

      if (!base64Data) {
        throw new Error("No XMind data received from function.");
      }

      // Decode Base64 and create Blob
      const blob = base64ToBlob(base64Data, "application/vnd.xmind.workbook");
      const url = URL.createObjectURL(blob);

      // Trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mindMapTitle || t("mindMapModal.defaultFilename")}.xmind`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading XMind file:", error);
      // Check for specific Firebase Functions error codes if needed
      let userMessage = t("mindMapModal.errors.downloadFailedGeneric");
      if (error.code === "invalid-argument") {
        userMessage = t("mindMapModal.errors.downloadFailedGeneric");
      } else if (error.message?.includes("Failed to convert")) {
        userMessage = t("mindMapModal.errors.conversionFailed");
      }
      alert(userMessage);
    } finally {
      setIsLoadingXmind(false);
    }
  };

  return (
    <>
      <button
        className="p-2 rounded-full text-gray-600 hover:bg-stone-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => setIsModalOpen(true)}
        disabled={isLoadingXmind}
        aria-label={t("mindMapModal.downloadXmind.downloadButton")}
      >
        {isLoadingXmind ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileEdit className="h-5 w-5" />
        )}
      </button>

      <XmindModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={() => {
          setIsModalOpen(false);
          handleDownloadXmind();
        }}
      />
    </>
  );
};

XmindModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

DownloadXmindButton.propTypes = {
  mermaidText: PropTypes.string.isRequired,
  mindMapTitle: PropTypes.string,
};

export default DownloadXmindButton;

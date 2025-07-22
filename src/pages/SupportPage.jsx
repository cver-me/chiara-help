import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, MessageSquare } from "lucide-react";
import SupportModal from "../components/SupportModal";
import { useTranslation } from "react-i18next";

const SupportPage = () => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="bg-stone-50 min-h-screen py-12 px-4 flex items-center justify-center">
      <div className="max-w-xl mx-auto w-full">
        <div className="mb-6">
          <Link
            to="/start"
            className="inline-flex items-center text-stone-600 hover:text-stone-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            {t("supportPage.backToHome")}
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-stone-200 p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-stone-100 p-4 rounded-full border border-stone-200">
              <Mail className="w-8 h-8 text-stone-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-stone-900 mb-3">
            {t("supportPage.title")}
          </h1>

          <p className="text-base text-stone-600 mb-8 max-w-md mx-auto">
            {t("supportPage.description")}
          </p>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center px-5 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors duration-200 shadow-sm text-base font-medium"
          >
            <MessageSquare className="w-5 h-5 mr-2" />
            {t("supportPage.openFormButton")}
          </button>

          <p className="text-sm text-stone-500 mt-6">
            {t("supportPage.footerText")}
          </p>
        </div>
      </div>

      {/* Support Modal */}
      <SupportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default SupportPage;

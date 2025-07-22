// import { Link } from "react-router-dom";
// import { NotebookTabs, Brain, BookOpen, Presentation } from "lucide-react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useState, useEffect } from "react";
import {
  Mail,
  BookOpen,
  ExternalLink,
  UploadCloud,
  MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const HomePage = () => {
  const { t } = useTranslation();
  const [userName, setUserName] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserName(user.displayName || null);
      } else {
        setUserName(null);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen py-12 px-4 flex items-center justify-center">
      <div className="max-w-xl mx-auto w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-stone-900 mb-2">
            {userName
              ? t("homePage.welcomeBack", { name: userName })
              : t("homePage.welcomeChiara")}
          </h1>
          <p className="text-base text-stone-600 mb-4">
            {t("homePage.subtitle")}
          </p>
          <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full border border-yellow-200">
            {t("homePage.betaLabel")}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          <Link
            to="/study-material"
            className="block p-6 bg-white rounded-xl shadow-md border border-stone-200 hover:shadow-lg hover:border-stone-300 transition-all duration-200 text-center"
          >
            <div className="flex justify-center mb-3">
              <div className="bg-stone-100 p-3 rounded-full border border-stone-200">
                <UploadCloud className="w-6 h-6 text-stone-600" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-stone-800 mb-1">
              {t("homePage.studyMaterialTitle")}
            </h2>
            <p className="text-sm text-stone-600">
              {t("homePage.studyMaterialDesc")}
            </p>
          </Link>

          <Link
            to="/chat"
            className="block p-6 bg-white rounded-xl shadow-md border border-stone-200 hover:shadow-lg hover:border-stone-300 transition-all duration-200 text-center"
          >
            <div className="flex justify-center mb-3">
              <div className="bg-stone-100 p-3 rounded-full border border-stone-200">
                <MessageCircle className="w-6 h-6 text-stone-600" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-stone-800 mb-1">
              {t("homePage.startChattingTitle")}
            </h2>
            <p className="text-sm text-stone-600">
              {t("homePage.startChattingDesc")}
            </p>
          </Link>
        </div>

        <div className="text-center text-stone-600 text-sm space-y-3">
          <p>{t("homePage.feedbackPrompt")}</p>
          <div className="flex items-center justify-center space-x-6">
            <Link
              to="/support"
              className="inline-flex items-center px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors duration-200 shadow-sm text-sm font-medium"
            >
              <Mail className="w-4 h-4 mr-2" />
              {t("homePage.sendFeedbackButton")}
            </Link>
            <a
              href="https://chiara-tutor.notion.site/Benvenuto-su-Chiara-1c2c9843193c80c7a9c3fd54bf400d51?pvs=4"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-stone-600 hover:text-stone-800 transition-colors"
            >
              <BookOpen className="w-4 h-4 mr-1.5" />
              {t("homePage.readGuideLink")}
              <ExternalLink className="w-3.5 h-3.5 ml-1 text-stone-500" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;

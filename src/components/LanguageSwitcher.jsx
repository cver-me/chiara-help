import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={() => i18n.changeLanguage("en")}
        className={`text-sm ${
          i18n.language === "en"
            ? "text-stone-900 font-medium"
            : "text-stone-500 hover:text-stone-700"
        } transition-colors`}
      >
        EN
      </button>
      <span className="text-stone-300">|</span>
      <button
        onClick={() => i18n.changeLanguage("it")}
        className={`text-sm ${
          i18n.language === "it"
            ? "text-stone-900 font-medium"
            : "text-stone-500 hover:text-stone-700"
        } transition-colors`}
      >
        IT
      </button>
    </div>
  );
}

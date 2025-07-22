import Select from "react-select";
import {
  Sliders,
  List,
  LayoutList,
  Heading,
  Highlighter,
  Check,
} from "lucide-react";
import PropTypes from "prop-types";

const LearningPreferencesSection = ({
  userData,
  handleComplexityChange,
  handleExamplesChange,
  handleContentLengthChange,
  handleFormatToggle,
  t,
  selectStyles,
  complexityOptions,
  examplesOptions,
  contentLengthOptions,
}) => {
  return (
    <section
      id="learning-preferences"
      className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden mt-8 scroll-mt-24"
    >
      <div className="px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-stone-500" />
          <h2 className="text-base font-semibold text-stone-900">
            {t("account.preferences.title") || "Learning Preferences"}
          </h2>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-stone-900 mb-4">
            {t("onboarding.step3.title")}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                {t("onboarding.step4.preferences.explanations")}
              </label>
              <Select
                value={complexityOptions.find(
                  (option) =>
                    option.value ===
                    userData.learningPreferences.contentComplexity
                )}
                onChange={handleComplexityChange}
                options={complexityOptions}
                styles={selectStyles}
                className="text-sm"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                {t("onboarding.step4.preferences.examples")}
              </label>
              <Select
                value={examplesOptions.find(
                  (option) =>
                    option.value ===
                    userData.learningPreferences.examplesPreference
                )}
                onChange={handleExamplesChange}
                options={examplesOptions}
                styles={selectStyles}
                className="text-sm"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                {t("onboarding.step4.preferences.length")}
              </label>
              <Select
                value={contentLengthOptions.find(
                  (option) =>
                    option.value === userData.learningPreferences.contentLength
                )}
                onChange={handleContentLengthChange}
                options={contentLengthOptions}
                styles={selectStyles}
                className="text-sm"
                menuPortalTarget={document.body}
                menuPosition="fixed"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-stone-200">
          <h3 className="text-sm font-medium text-stone-900 mb-4">
            {t("onboarding.step3.formatPrefsTitle")}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center">
              <label
                htmlFor="bullet-points"
                className="flex items-center cursor-pointer"
              >
                <div className="relative">
                  <input
                    id="bullet-points"
                    name="bullet-points"
                    type="checkbox"
                    checked={
                      userData.contentFormatPreferences.prefersBulletPoints
                    }
                    onChange={() => handleFormatToggle("prefersBulletPoints")}
                    className="sr-only"
                  />
                  <div
                    className={`h-4 w-4 rounded flex items-center justify-center border ${
                      userData.contentFormatPreferences.prefersBulletPoints
                        ? "bg-stone-700 border-stone-700"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {userData.contentFormatPreferences.prefersBulletPoints && (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <List className="h-4 w-4 text-stone-500" />
                  <span className="text-sm text-stone-700">
                    {t("onboarding.step3.format.bulletPoints")}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center">
              <label
                htmlFor="numbered-lists"
                className="flex items-center cursor-pointer"
              >
                <div className="relative">
                  <input
                    id="numbered-lists"
                    name="numbered-lists"
                    type="checkbox"
                    checked={
                      userData.contentFormatPreferences.prefersNumberedLists
                    }
                    onChange={() => handleFormatToggle("prefersNumberedLists")}
                    className="sr-only"
                  />
                  <div
                    className={`h-4 w-4 rounded flex items-center justify-center border ${
                      userData.contentFormatPreferences.prefersNumberedLists
                        ? "bg-stone-700 border-stone-700"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {userData.contentFormatPreferences.prefersNumberedLists && (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <LayoutList className="h-4 w-4 text-stone-500" />
                  <span className="text-sm text-stone-700">
                    {t("onboarding.step3.format.numberedLists")}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center">
              <label
                htmlFor="headings"
                className="flex items-center cursor-pointer"
              >
                <div className="relative">
                  <input
                    id="headings"
                    name="headings"
                    type="checkbox"
                    checked={userData.contentFormatPreferences.prefersHeadings}
                    onChange={() => handleFormatToggle("prefersHeadings")}
                    className="sr-only"
                  />
                  <div
                    className={`h-4 w-4 rounded flex items-center justify-center border ${
                      userData.contentFormatPreferences.prefersHeadings
                        ? "bg-stone-700 border-stone-700"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {userData.contentFormatPreferences.prefersHeadings && (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <Heading className="h-4 w-4 text-stone-500" />
                  <span className="text-sm text-stone-700">
                    {t("onboarding.step3.format.headings")}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center">
              <label
                htmlFor="highlighting"
                className="flex items-center cursor-pointer"
              >
                <div className="relative">
                  <input
                    id="highlighting"
                    name="highlighting"
                    type="checkbox"
                    checked={
                      userData.contentFormatPreferences.prefersHighlighting
                    }
                    onChange={() => handleFormatToggle("prefersHighlighting")}
                    className="sr-only"
                  />
                  <div
                    className={`h-4 w-4 rounded flex items-center justify-center border ${
                      userData.contentFormatPreferences.prefersHighlighting
                        ? "bg-stone-700 border-stone-700"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {userData.contentFormatPreferences.prefersHighlighting && (
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    )}
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  <Highlighter className="h-4 w-4 text-stone-500" />
                  <span className="text-sm text-stone-700">
                    {t("onboarding.step3.format.highlighting")}
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="text-sm text-stone-500 pt-4 border-t border-stone-200">
          <p>{t("onboarding.step4.learningIntro")}</p>
        </div>
      </div>
    </section>
  );
};

LearningPreferencesSection.propTypes = {
  userData: PropTypes.object.isRequired,
  handleComplexityChange: PropTypes.func.isRequired,
  handleExamplesChange: PropTypes.func.isRequired,
  handleContentLengthChange: PropTypes.func.isRequired,
  handleFormatToggle: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  selectStyles: PropTypes.object.isRequired,
  complexityOptions: PropTypes.array.isRequired,
  examplesOptions: PropTypes.array.isRequired,
  contentLengthOptions: PropTypes.array.isRequired,
};

export default LearningPreferencesSection;

import { useState } from "react";
import { User, GraduationCap, Sparkles, Smile } from "lucide-react";
import PropTypes from "prop-types";
import Select from "react-select";
import { getNames, getCode } from "country-list";
import { useTranslation } from "react-i18next";

// Create the options array for react-select with Italy prioritized
const allCountries = getNames().map((name) => ({
  value: getCode(name),
  label: name,
}));

// Remove Italy from the main list and add it at the top with a separator
const italyOption = allCountries.find((country) => country.value === "IT");
const otherCountries = allCountries.filter((country) => country.value !== "IT");

const countryOptions = [
  ...(italyOption ? [italyOption] : []),
  ...(italyOption ? [{ value: "", label: "────", isDisabled: true }] : []),
  ...otherCountries,
];

const selectStyles = {
  control: (base, state) => ({
    ...base,
    borderColor: state.isFocused ? "rgb(87, 83, 78)" : "#e5e7eb",
    boxShadow: state.isFocused ? "0 0 0 1px rgb(87, 83, 78)" : "none",
    borderRadius: "0.5rem",
    "&:hover": {
      borderColor: "rgb(87, 83, 78)",
    },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "rgb(87, 83, 78)"
      : state.isFocused
        ? "rgb(245 245 244)"
        : "white",
    color: state.isSelected ? "white" : "rgb(28 25 23)",
    "&:active": {
      backgroundColor: state.isSelected
        ? "rgb(87, 83, 78)"
        : "rgb(245 245 244)",
    },
  }),
  input: (base) => ({
    ...base,
    color: "rgb(28 25 23)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "rgb(28 25 23)",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

export const Step1 = ({ onNext, user, data }) => {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(
    data?.fullName || user?.displayName || ""
  );
  const [ageRange, setAgeRange] = useState(
    data?.ageRange ? { value: data.ageRange, label: data.ageRange } : null
  );
  const [selectedCountry, setSelectedCountry] = useState(
    data?.countryCode ? { value: data.countryCode, label: data.country } : null
  );
  // Detect mobile to avoid fixed portal positioning issues with on-screen keyboard
  const isMobile =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);

  const ageRangeOptions = [
    { value: "13-17", label: "13-17" },
    { value: "18-24", label: "18-24" },
    { value: "25-34", label: "25-34" },
    { value: "35-44", label: "35-44" },
    { value: "45+", label: "45+" },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onNext({
      fullName,
      ageRange: ageRange.value,
      country: selectedCountry.label,
      countryCode: selectedCountry.value,
    });
  };

  return (
    <div className="max-w-xl mx-auto text-center px-4 sm:px-0 pt-12 pb-20 sm:pt-16 sm:pb-20 flex flex-col h-full overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="mb-8 sm:mb-12">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8">
            <User className="w-6 h-6 sm:w-8 sm:h-8 text-stone-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 mb-2 sm:mb-3">
            {t("onboarding.step1.title")}
          </h1>
          <p className="text-base sm:text-lg text-stone-600">
            {t("onboarding.step1.subtitle")}
          </p>
        </div>

        <form
          id="step1-form"
          onSubmit={handleSubmit}
          className="space-y-4 sm:space-y-6 text-left"
        >
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("onboarding.step1.fullName")}
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-0 focus:border-stone-600 hover:border-stone-600 text-stone-900 transition-colors"
              required
            />
            {user?.displayName && fullName !== user.displayName && (
              <p className="mt-2 text-sm text-stone-500">
                {t("onboarding.step1.differentName", {
                  name: user.displayName,
                })}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("onboarding.step1.ageRange")}
            </label>
            <Select
              required
              value={ageRange}
              onChange={setAgeRange}
              options={ageRangeOptions}
              styles={selectStyles}
              placeholder={t("onboarding.step1.ageRangePlaceholder")}
              isClearable={false}
              isSearchable={false}
              menuPlacement="auto"
              {...(!isMobile
                ? { menuPortalTarget: document.body, menuPosition: "fixed" }
                : {})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {t("onboarding.step1.country")}
            </label>
            <Select
              required
              value={selectedCountry}
              onChange={setSelectedCountry}
              options={countryOptions}
              styles={selectStyles}
              placeholder={t("onboarding.step1.countryPlaceholder")}
              isClearable={false}
              isSearchable={true}
              menuPlacement="auto"
              {...(!isMobile
                ? { menuPortalTarget: document.body, menuPosition: "fixed" }
                : {})}
            />
          </div>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-stone-200">
        <div className="max-w-xl mx-auto px-4 py-4">
          <div className="flex justify-center gap-3 sm:gap-4">
            <button
              type="submit"
              form="step1-form"
              disabled={!fullName || !ageRange || !selectedCountry}
              className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-stone-900 text-white font-medium rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:bg-stone-300 disabled:hover:bg-stone-300 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-stone-600"
            >
              {t("onboarding.common.continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

Step1.propTypes = {
  onNext: PropTypes.func.isRequired,
  user: PropTypes.shape({
    displayName: PropTypes.string,
  }),
  data: PropTypes.shape({
    fullName: PropTypes.string,
    ageRange: PropTypes.string,
    countryCode: PropTypes.string,
    country: PropTypes.string,
  }),
};

export const Step2 = ({ onNext, onBack, data }) => {
  const { t } = useTranslation();
  const [role, setRole] = useState(data?.role || "");
  const [educationLevel, setEducationLevel] = useState(
    data?.educationLevel || ""
  );
  const [showUniversityOptions, setShowUniversityOptions] = useState(
    data?.educationLevel === "bachelor" ||
      data?.educationLevel === "master" ||
      data?.educationLevel === "phd"
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onNext({
      ...data,
      role,
      educationLevel,
    });
  };

  const handleEducationClick = (level) => {
    setEducationLevel(level);
    setShowUniversityOptions(["bachelor", "master", "phd"].includes(level));
  };

  const handleUniversityGroupClick = () => {
    setShowUniversityOptions(true);
    if (educationLevel === "highschool" || educationLevel === "middleschool") {
      setEducationLevel("");
    }
  };

  const isFormValid = role && educationLevel;

  return (
    <div className="max-w-xl mx-auto text-center px-4 sm:px-0 pt-12 pb-20 sm:pt-16 sm:pb-20 flex flex-col h-full overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="mb-8 sm:mb-12">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8">
            <GraduationCap className="w-6 h-6 sm:w-8 sm:h-8 text-stone-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 mb-2 sm:mb-3">
            {t("onboarding.step2.title")}
          </h1>
          <p className="text-base sm:text-lg text-stone-600">
            {t("onboarding.step2.subtitle")}
          </p>
        </div>

        <form
          id="step2-form"
          onSubmit={handleSubmit}
          className="space-y-4 sm:space-y-6 text-left"
        >
          <fieldset>
            <legend className="block text-sm font-medium text-stone-700 mb-1">
              {t("onboarding.step2.title")}
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setRole("student")}
                className={`p-4 sm:p-6 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  role === "student"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <h3 className="font-medium text-stone-900 mb-1">
                  {t("onboarding.step2.roles.student.title")}
                </h3>
                <p className="text-sm text-stone-600">
                  {t("onboarding.step2.roles.student.description")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setRole("teacher")}
                className={`p-4 sm:p-6 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  role === "teacher"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <h3 className="font-medium text-stone-900 mb-1">
                  {t("onboarding.step2.roles.teacher.title")}
                </h3>
                <p className="text-sm text-stone-600">
                  {t("onboarding.step2.roles.teacher.description")}
                </p>
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="block text-sm font-medium text-stone-700 mb-1">
              {t("onboarding.step2.title")}
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
              <button
                type="button"
                onClick={() => handleEducationClick("middleschool")}
                className={`p-4 sm:p-6 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  educationLevel === "middleschool"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <h3 className="font-medium text-stone-900 mb-1">
                  {t("onboarding.step2.levels.middleschool.title")}
                </h3>
                <p className="text-sm text-stone-600">
                  {t("onboarding.step2.levels.middleschool.description")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleEducationClick("highschool")}
                className={`p-4 sm:p-6 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  educationLevel === "highschool"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <h3 className="font-medium text-stone-900 mb-1">
                  {t("onboarding.step2.levels.highschool.title")}
                </h3>
                <p className="text-sm text-stone-600">
                  {t("onboarding.step2.levels.highschool.description")}
                </p>
              </button>
              <button
                type="button"
                onClick={handleUniversityGroupClick}
                className={`p-4 sm:p-6 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  showUniversityOptions
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <h3 className="font-medium text-stone-900 mb-1">
                  {t("onboarding.step2.levels.university.title")}
                </h3>
                <p className="text-sm text-stone-600">
                  {t("onboarding.step2.levels.university.description")}
                </p>
              </button>
            </div>

            {showUniversityOptions && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-stone-700 mb-1 text-left">
                  {t("onboarding.step2.selectDegreeLevel")}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => handleEducationClick("bachelor")}
                    className={`p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                      educationLevel === "bachelor"
                        ? "border-stone-600 bg-stone-100"
                        : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <h3 className="font-medium text-stone-900">
                      {t("onboarding.step2.degrees.bachelor")}
                    </h3>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEducationClick("master")}
                    className={`p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                      educationLevel === "master"
                        ? "border-stone-600 bg-stone-100"
                        : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <h3 className="font-medium text-stone-900">
                      {t("onboarding.step2.degrees.master")}
                    </h3>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEducationClick("phd")}
                    className={`p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                      educationLevel === "phd"
                        ? "border-stone-600 bg-stone-100"
                        : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    <h3 className="font-medium text-stone-900">
                      {t("onboarding.step2.degrees.phd")}
                    </h3>
                  </button>
                </div>
              </div>
            )}
          </fieldset>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-stone-200">
        <div className="max-w-xl mx-auto px-4 py-4">
          <div className="flex justify-between gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => onBack(data)}
              className="w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-stone-700 border border-stone-300 font-medium rounded-lg hover:bg-stone-50 transition-colors focus:outline-none focus:ring-1 focus:ring-stone-600"
            >
              {t("onboarding.common.back")}
            </button>
            <button
              type="submit"
              form="step2-form"
              disabled={!isFormValid}
              className="w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-stone-900 text-white font-medium rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:bg-stone-300 disabled:hover:bg-stone-300 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-stone-600"
            >
              {t("onboarding.common.continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

Step2.propTypes = {
  onNext: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  data: PropTypes.object,
};

export const Step3 = ({ onNext, onBack, data }) => {
  const { t } = useTranslation();

  // State for Learning Preferences - Use direct string values
  const [contentComplexity, setContentComplexity] = useState(
    data?.learningPreferences?.contentComplexity || ""
  );
  const [examplesPreference, setExamplesPreference] = useState(
    data?.learningPreferences?.examplesPreference || ""
  );
  const [contentLength, setContentLength] = useState(
    data?.learningPreferences?.contentLength || ""
  );

  const [prefersBulletPoints, setPrefersBulletPoints] = useState(
    data?.contentFormatPreferences?.prefersBulletPoints || false
  );
  const [prefersNumberedLists, setPrefersNumberedLists] = useState(
    data?.contentFormatPreferences?.prefersNumberedLists || false
  );
  const [prefersHeadings, setPrefersHeadings] = useState(
    data?.contentFormatPreferences?.prefersHeadings || true
  );
  const [prefersHighlighting, setPrefersHighlighting] = useState(
    data?.contentFormatPreferences?.prefersHighlighting || true
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const stepData = {
      ...data,
      learningPreferences: {
        contentComplexity,
        examplesPreference,
        contentLength,
      },
      contentFormatPreferences: {
        prefersBulletPoints,
        prefersNumberedLists,
        prefersHeadings,
        prefersHighlighting,
      },
    };
    onNext(stepData);
  };

  const isFormValid = contentComplexity && examplesPreference && contentLength;

  return (
    <div className="max-w-xl mx-auto text-center px-4 sm:px-0 pt-12 pb-20 sm:pt-16 sm:pb-20 flex flex-col h-full overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-stone-600" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 mb-1 sm:mb-2">
            {t("onboarding.step3.title")}
          </h1>
          <p className="text-sm sm:text-base text-stone-600">
            {t("onboarding.step3.subtitle")}
          </p>
        </div>

        <form
          id="step3-form"
          onSubmit={handleSubmit}
          className="space-y-6 text-left mb-6"
        >
          {/* Content Complexity Question */}
          <fieldset>
            <legend className="block text-sm font-medium text-stone-700 mb-3">
              {t("onboarding.step3.questions.complexity.question")}
            </legend>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setContentComplexity("simplified")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  contentComplexity === "simplified"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">📝</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t(
                        "onboarding.step3.questions.complexity.simplified.title"
                      )}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.complexity.simplified.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setContentComplexity("balanced")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  contentComplexity === "balanced"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">⚖️</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t(
                        "onboarding.step3.questions.complexity.balanced.title"
                      )}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.complexity.balanced.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setContentComplexity("advanced")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  contentComplexity === "advanced"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">🔍</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t(
                        "onboarding.step3.questions.complexity.advanced.title"
                      )}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.complexity.advanced.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </fieldset>

          {/* Examples Preference Question */}
          <fieldset>
            <legend className="block text-sm font-medium text-stone-700 mb-3">
              {t("onboarding.step3.questions.examples.question")}
            </legend>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setExamplesPreference("few")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  examplesPreference === "few"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">🎯</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t("onboarding.step3.questions.examples.few.title")}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t("onboarding.step3.questions.examples.few.description")}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExamplesPreference("balanced")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  examplesPreference === "balanced"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">📊</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t("onboarding.step3.questions.examples.balanced.title")}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.examples.balanced.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExamplesPreference("many")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  examplesPreference === "many"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">🌟</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t("onboarding.step3.questions.examples.many.title")}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.examples.many.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </fieldset>

          {/* Content Length Question */}
          <fieldset>
            <legend className="block text-sm font-medium text-stone-700 mb-3">
              {t("onboarding.step3.questions.length.question")}
            </legend>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setContentLength("concise")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  contentLength === "concise"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">⚡</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t("onboarding.step3.questions.length.concise.title")}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.length.concise.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setContentLength("balanced")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  contentLength === "balanced"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">📋</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t("onboarding.step3.questions.length.balanced.title")}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.length.balanced.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setContentLength("detailed")}
                className={`w-full p-4 text-left border rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-600 transition-colors ${
                  contentLength === "detailed"
                    ? "border-stone-600 bg-stone-100"
                    : "border-stone-200 hover:border-stone-600 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">📚</span>
                  <div>
                    <h3 className="font-medium text-stone-900 mb-1">
                      {t("onboarding.step3.questions.length.detailed.title")}
                    </h3>
                    <p className="text-sm text-stone-600">
                      {t(
                        "onboarding.step3.questions.length.detailed.description"
                      )}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </fieldset>

          {/* Format Preferences - Keep existing checkboxes */}
          <fieldset className="space-y-3 border border-stone-200 p-3 sm:p-4 rounded-lg">
            <legend className="text-lg font-medium text-stone-800 px-1 mb-1">
              {t("onboarding.step3.formatPrefsTitle")}
            </legend>

            <div className="flex items-start space-x-3 mb-3">
              <label
                htmlFor="bulletPoints"
                className="flex items-start space-x-3 cursor-pointer"
              >
                <div className="flex h-5 items-center">
                  <input
                    id="bulletPoints"
                    name="bulletPoints"
                    type="checkbox"
                    checked={prefersBulletPoints}
                    onChange={(e) => setPrefersBulletPoints(e.target.checked)}
                    className="sr-only"
                  />
                  <div className="relative flex items-center justify-center h-4 w-4 cursor-pointer">
                    <div
                      className={`h-4 w-4 rounded border ${prefersBulletPoints ? "bg-stone-600 border-stone-600" : "border-stone-300 bg-white"} transition-colors focus-within:ring-1 focus-within:ring-stone-600`}
                    ></div>
                    {prefersBulletPoints && (
                      <svg
                        className="absolute h-3 w-3 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-stone-700">
                    {t("onboarding.step3.format.bulletPoints")}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-start space-x-3 mb-3">
              <label
                htmlFor="numberedLists"
                className="flex items-start space-x-3 cursor-pointer"
              >
                <div className="flex h-5 items-center">
                  <input
                    id="numberedLists"
                    name="numberedLists"
                    type="checkbox"
                    checked={prefersNumberedLists}
                    onChange={(e) => setPrefersNumberedLists(e.target.checked)}
                    className="sr-only"
                  />
                  <div className="relative flex items-center justify-center h-4 w-4 cursor-pointer">
                    <div
                      className={`h-4 w-4 rounded border ${prefersNumberedLists ? "bg-stone-600 border-stone-600" : "border-stone-300 bg-white"} transition-colors focus-within:ring-1 focus-within:ring-stone-600`}
                    ></div>
                    {prefersNumberedLists && (
                      <svg
                        className="absolute h-3 w-3 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-stone-700">
                    {t("onboarding.step3.format.numberedLists")}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-start space-x-3 mb-3">
              <label
                htmlFor="headings"
                className="flex items-start space-x-3 cursor-pointer"
              >
                <div className="flex h-5 items-center">
                  <input
                    id="headings"
                    name="headings"
                    type="checkbox"
                    checked={prefersHeadings}
                    onChange={(e) => setPrefersHeadings(e.target.checked)}
                    className="sr-only"
                  />
                  <div className="relative flex items-center justify-center h-4 w-4 cursor-pointer">
                    <div
                      className={`h-4 w-4 rounded border ${prefersHeadings ? "bg-stone-600 border-stone-600" : "border-stone-300 bg-white"} transition-colors focus-within:ring-1 focus-within:ring-stone-600`}
                    ></div>
                    {prefersHeadings && (
                      <svg
                        className="absolute h-3 w-3 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-stone-700">
                    {t("onboarding.step3.format.headings")}
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-start space-x-3">
              <label
                htmlFor="highlighting"
                className="flex items-start space-x-3 cursor-pointer"
              >
                <div className="flex h-5 items-center">
                  <input
                    id="highlighting"
                    name="highlighting"
                    type="checkbox"
                    checked={prefersHighlighting}
                    onChange={(e) => setPrefersHighlighting(e.target.checked)}
                    className="sr-only"
                  />
                  <div className="relative flex items-center justify-center h-4 w-4 cursor-pointer">
                    <div
                      className={`h-4 w-4 rounded border ${prefersHighlighting ? "bg-stone-600 border-stone-600" : "border-stone-300 bg-white"} transition-colors focus-within:ring-1 focus-within:ring-stone-600`}
                    ></div>
                    {prefersHighlighting && (
                      <svg
                        className="absolute h-3 w-3 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-stone-700">
                    {t("onboarding.step3.format.highlighting")}
                  </span>
                </div>
              </label>
            </div>
          </fieldset>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-stone-200">
        <div className="max-w-xl mx-auto px-4 py-4">
          <div className="flex justify-between gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => onBack(data)}
              className="w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-stone-700 border border-stone-300 font-medium rounded-lg hover:bg-stone-50 transition-colors focus:outline-none focus:ring-1 focus:ring-stone-600"
            >
              {t("onboarding.common.back")}
            </button>
            <button
              type="submit"
              form="step3-form"
              disabled={!isFormValid}
              className="w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-stone-900 text-white font-medium rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:bg-stone-300 disabled:hover:bg-stone-300 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-stone-600"
            >
              {t("onboarding.common.continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

Step3.propTypes = {
  onNext: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  data: PropTypes.object.isRequired,
};

export const Step4 = ({ onComplete, onBack, data }) => {
  const { t } = useTranslation();

  const getLearningPreferenceText = (prefType, value) => {
    return t(`onboarding.step3.questions.${prefType}.${value}.title`);
  };

  const getLearningPreferenceDescription = (prefType, value) => {
    return t(`onboarding.step3.questions.${prefType}.${value}.description`);
  };

  return (
    <div className="max-w-xl mx-auto text-center px-4 sm:px-0 pt-12 pb-20 sm:pt-16 sm:pb-20 flex flex-col h-full overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <Smile className="w-5 h-5 sm:w-6 sm:h-6 text-stone-600" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 mb-1 sm:mb-2">
            {t("onboarding.step4.title")}
          </h1>
          <p className="text-sm sm:text-base text-stone-600 mb-6">
            {t("onboarding.step4.subtitle")}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-stone-200 p-4 sm:p-6 text-left space-y-6 mb-6">
          {/* Personal Information */}
          <div>
            <h3 className="font-medium text-stone-900 mb-3 text-lg">
              {t("onboarding.step4.personalInfo")}
            </h3>
            <div className="space-y-3">
              <p className="text-base text-stone-700">
                {t("onboarding.step4.greeting", { name: data.fullName })}
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  📍 {data.country}
                </span>
                <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  🎂 {data.ageRange}
                </span>
                <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  {data.role === "student" ? "🎓" : "👨‍🏫"}{" "}
                  {t(`onboarding.step2.roles.${data.role}.title`)}
                </span>
                <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                  📚{" "}
                  {data.educationLevel === "highschool"
                    ? t("onboarding.step2.levels.highschool.title")
                    : data.educationLevel === "middleschool"
                      ? t("onboarding.step2.levels.middleschool.title")
                      : t(`onboarding.step2.degrees.${data.educationLevel}`)}
                </span>
              </div>
            </div>
          </div>

          {/* Learning Preferences */}
          {data.learningPreferences && (
            <div>
              <h3 className="font-medium text-stone-900 mb-3 text-lg">
                {t("onboarding.step4.learningStyle")}
              </h3>
              <div className="space-y-4">
                <p className="text-base text-stone-700">
                  {t("onboarding.step4.learningIntro")}
                </p>

                <div className="space-y-3">
                  <div className="flex items-start space-x-3 p-3 bg-stone-50 rounded-lg">
                    <span className="text-lg">📝</span>
                    <div>
                      <p className="text-sm text-stone-600 mb-1">
                        {t("onboarding.step4.preferences.explanations")}
                      </p>
                      <p className="font-medium text-stone-900">
                        {getLearningPreferenceText(
                          "complexity",
                          data.learningPreferences.contentComplexity
                        )}
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        {getLearningPreferenceDescription(
                          "complexity",
                          data.learningPreferences.contentComplexity
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 bg-stone-50 rounded-lg">
                    <span className="text-lg">📊</span>
                    <div>
                      <p className="text-sm text-stone-600 mb-1">
                        {t("onboarding.step4.preferences.examples")}
                      </p>
                      <p className="font-medium text-stone-900">
                        {getLearningPreferenceText(
                          "examples",
                          data.learningPreferences.examplesPreference
                        )}
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        {getLearningPreferenceDescription(
                          "examples",
                          data.learningPreferences.examplesPreference
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 bg-stone-50 rounded-lg">
                    <span className="text-lg">📋</span>
                    <div>
                      <p className="text-sm text-stone-600 mb-1">
                        {t("onboarding.step4.preferences.length")}
                      </p>
                      <p className="font-medium text-stone-900">
                        {getLearningPreferenceText(
                          "length",
                          data.learningPreferences.contentLength
                        )}
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        {getLearningPreferenceDescription(
                          "length",
                          data.learningPreferences.contentLength
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Format Preferences */}
          {data.contentFormatPreferences && (
            <div>
              <h3 className="font-medium text-stone-900 mb-3 text-lg">
                {t("onboarding.step4.formatStyle")}
              </h3>
              <div className="space-y-3">
                <p className="text-base text-stone-700">
                  {t("onboarding.step4.formatIntro")}
                </p>

                <div className="flex flex-wrap gap-2">
                  {data.contentFormatPreferences.prefersBulletPoints && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      ✓ {t("onboarding.step3.format.bulletPoints")}
                    </span>
                  )}
                  {data.contentFormatPreferences.prefersNumberedLists && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      ✓ {t("onboarding.step3.format.numberedLists")}
                    </span>
                  )}
                  {data.contentFormatPreferences.prefersHeadings && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      ✓ {t("onboarding.step3.format.headings")}
                    </span>
                  )}
                  {data.contentFormatPreferences.prefersHighlighting && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      ✓ {t("onboarding.step3.format.highlighting")}
                    </span>
                  )}
                  {!data.contentFormatPreferences.prefersBulletPoints &&
                    !data.contentFormatPreferences.prefersNumberedLists &&
                    !data.contentFormatPreferences.prefersHeadings &&
                    !data.contentFormatPreferences.prefersHighlighting && (
                      <span className="text-stone-600 italic text-sm">
                        {t("onboarding.step4.noFormatPrefs")}
                      </span>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Ready Message */}
          <div className="bg-gradient-to-r from-stone-50 to-stone-100 p-4 rounded-lg border border-stone-200">
            <p className="text-center text-stone-700 font-medium">
              {t("onboarding.step4.readyMessage")}
            </p>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-stone-200">
        <div className="max-w-xl mx-auto px-4 py-4">
          <div className="flex justify-between gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => onBack(data)}
              className="w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-stone-700 border border-stone-300 font-medium rounded-lg hover:bg-stone-50 transition-colors focus:outline-none focus:ring-1 focus:ring-stone-600"
            >
              {t("onboarding.common.back")}
            </button>
            <button
              type="button"
              onClick={() => onComplete(data)}
              className="w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-stone-900 text-white font-medium rounded-lg hover:bg-stone-700 transition-colors focus:outline-none focus:ring-1 focus:ring-stone-600"
            >
              {t("onboarding.common.getStarted")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

Step4.propTypes = {
  onComplete: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  data: PropTypes.object,
};

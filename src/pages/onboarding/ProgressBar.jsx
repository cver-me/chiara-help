import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const ProgressBar = ({ currentStep, totalSteps }) => {
  const { t } = useTranslation();
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-stone-600">
            {t("onboarding.progressBar.stepCount", {
              current: currentStep,
              total: totalSteps,
            })}
          </span>
        </div>
        <div className="w-full bg-stone-100 rounded-full h-2">
          <div
            className="bg-stone-600 h-2 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

ProgressBar.propTypes = {
  currentStep: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
};

export default ProgressBar;

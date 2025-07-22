import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import {
  FileText,
  FileAudio,
  CheckCircle,
  Loader2,
  Network,
  BookOpenCheck,
  SquareAsterisk,
} from "lucide-react";

// Placeholder for explanation text and features
const StudyAidExplanation = React.memo(({ className }) => {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-col justify-center py-4 md:py-0 ${className}`}>
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-stone-800 mb-2">
          {t("studyAidGeneratorDemo.explanationTitle")}
        </h3>
        <p className="text-sm text-stone-600 leading-relaxed mb-4">
          {t("studyAidGeneratorDemo.explanationP1")}
        </p>
      </div>
      <ul className="space-y-2.5">
        {[
          t("studyAidGeneratorDemo.feature1"),
          t("studyAidGeneratorDemo.feature2"),
          t("studyAidGeneratorDemo.feature3"),
          t("studyAidGeneratorDemo.feature4"),
        ].map((feature, index) => (
          <li key={index} className="flex items-start text-sm text-stone-700">
            <CheckCircle className="w-4 h-4 text-green-500 mr-2.5 mt-0.5 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

StudyAidExplanation.propTypes = {
  className: PropTypes.string,
};

StudyAidExplanation.displayName = "StudyAidExplanation";

// Interactive demo with simplified steps
const AidGenerationVisualizer = ({ className }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false); // New state for animation control

  // Define the simplified steps of the demo
  const demoSteps = useMemo(
    () => [
      {
        id: "inputAudio",
        icon: FileAudio,
        label: t("studyAidGeneratorDemo.step1Label"),
        fileName: "Neuroscience_Lecture_Ep3.mp3",
        details: t("studyAidGeneratorDemo.step1Details"),
      },
      {
        id: "processing",
        label: t("studyAidGeneratorDemo.processingLabel"),
        details: t("studyAidGeneratorDemo.processingDetails"),
      },
      {
        id: "studyMaterials",
        label: t("studyAidGeneratorDemo.materialsLabel"),
        details: t("studyAidGeneratorDemo.materialsDetails"),
        materials: [
          {
            id: "notes",
            icon: FileText,
            name: t("studyAidGeneratorDemo.organizedNotes"),
          },
          {
            id: "flashcards",
            icon: SquareAsterisk,
            name: t("studyAidGeneratorDemo.flashcards"),
          },
          {
            id: "mindmap",
            icon: Network,
            name: t("studyAidGeneratorDemo.mindmap"),
          },
          {
            id: "quiz",
            icon: BookOpenCheck,
            name: t("studyAidGeneratorDemo.quiz"),
          },
        ],
      },
    ],
    [t]
  );

  useEffect(() => {
    const displayDurations = [3000, 1000, 3000]; // Input, Processing, Output
    const animationDuration = 300; // Duration of fade effect

    let fadeInTimer;
    let displayTimer;
    let fadeOutTimer;

    // Initially hide all content
    setIsFadingOut(true);

    // After a brief delay, fade in and handle processing (ensures initial hidden state applied)
    fadeInTimer = setTimeout(() => {
      if (currentStep === 1) {
        setProcessing(true);
      } else {
        setProcessing(false);
      }
      // Fade in content
      setIsFadingOut(false);

      // After the content is visible for the duration, start fade-out
      displayTimer = setTimeout(() => {
        // Fade out content
        setIsFadingOut(true);

        // After fade-out completes, move to the next step
        fadeOutTimer = setTimeout(() => {
          // If the step that just faded out was the processing step,
          // turn off the processing state *now* that it's invisible.
          if (currentStep === 1) {
            setProcessing(false);
          }

          if (currentStep === 1) {
            // After processing, go to output step
            setCurrentStep(2);
          } else {
            // Next in cycle
            setCurrentStep((prev) => (prev + 1) % demoSteps.length);
          }
        }, animationDuration);
      }, displayDurations[currentStep]);
    }, 50);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(displayTimer);
      clearTimeout(fadeOutTimer);
    };
  }, [currentStep, demoSteps.length]);

  const activeStep = demoSteps[currentStep];
  const IconComponent = activeStep.icon;

  return (
    <div
      className={`relative bg-stone-50 p-4 sm:p-6 rounded-xl shadow-xl border border-stone-200/80 flex flex-col items-center justify-center h-[400px] text-center ${className}`}
    >
      {processing && currentStep === 1 && (
        <div className="absolute inset-0 bg-stone-50/80 flex flex-col items-center justify-center z-10 rounded-xl backdrop-blur-sm">
          <Loader2 className="w-12 h-12 text-stone-500 animate-spin mb-4" />
          <p className="text-stone-700 font-medium text-sm">
            {activeStep.label}
          </p>
          <p className="text-stone-500 text-xs">{activeStep.details}</p>
        </div>
      )}

      <div
        className={`transition-opacity duration-300 ${isFadingOut ? "opacity-0" : "opacity-100"} flex flex-col items-center w-full pb-6`}
      >
        {/* Content for non-processing steps */}
        {!processing && IconComponent && activeStep.id === "inputAudio" && (
          <div className="w-24 h-24 flex items-center justify-center">
            <IconComponent className="w-12 h-12 text-stone-500" />
          </div>
        )}

        {!processing && IconComponent && activeStep.id === "studyMaterials" && (
          <IconComponent className="w-16 h-16 text-stone-500 mb-4" />
        )}

        {!processing && (
          <>
            <h4 className="text-md font-semibold text-stone-800 mb-1">
              {activeStep.label}
            </h4>
            <p className="text-xs text-stone-500 mb-3 max-w-xs">
              {activeStep.details}
            </p>
          </>
        )}

        {!processing && activeStep.id === "inputAudio" && (
          <div className="mt-2 p-3 bg-white rounded-lg border border-stone-200 shadow-sm w-full max-w-sm">
            <p className="text-sm font-medium text-stone-700">
              {activeStep.fileName}
            </p>
          </div>
        )}

        {!processing &&
          activeStep.id === "studyMaterials" &&
          activeStep.materials && (
            <div className="mt-3 grid grid-cols-2 gap-3 w-full max-w-sm">
              {activeStep.materials.map((material) => {
                const MaterialIcon = material.icon;
                return (
                  <div
                    key={material.id}
                    className="p-3 bg-white rounded-lg border border-stone-200 shadow-sm flex flex-col items-center"
                  >
                    <MaterialIcon className="w-8 h-8 text-stone-500 mb-2" />
                    <p className="text-sm font-semibold text-stone-700 mb-1 text-center">
                      {material.name}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
      </div>

      {/* Progress dots */}
      <div className="flex space-x-1.5 mt-6 absolute bottom-4">
        {demoSteps.map((step, index) => (
          <div
            key={step.id}
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              index === currentStep ? "bg-stone-600 scale-110" : "bg-stone-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
};

AidGenerationVisualizer.propTypes = {
  className: PropTypes.string,
};

AidGenerationVisualizer.displayName = "AidGenerationVisualizer";

export default function StudyAidGeneratorDemo() {
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
        {/* DOM Order: Explanation first, then Visualizer for correct mobile stacking */}
        {/* Visual Order on Desktop: Visualizer (md:order-1) left, Explanation (md:order-2) right */}
        <StudyAidExplanation className="md:order-2" />
        <AidGenerationVisualizer className="md:order-1" />
      </div>
    </div>
  );
}

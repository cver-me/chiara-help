import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  FileText,
  Loader,
  ChevronRight,
  FastForward,
  Rewind,
  VolumeX,
} from "lucide-react";

// Placeholder academic text moved to translation.json and will be defined inside the component
const TIMINGS = {
  idle: 2000,
  selectingText: 2000,
  generate: 1500,
  showDetail: 2000,
  loopPause: 2500,
  assistantAppearDelay: 500,
};

const EnhancedDocumentEngagementDemo = () => {
  const { t } = useTranslation();
  // Localized placeholder paragraphs
  const placeholderDocumentText = [
    t("enhancedDemo.paragraph1"),
    t("enhancedDemo.paragraph2"),
    t("enhancedDemo.paragraph3"),
  ];

  // --- STATE MANAGEMENT ---
  const [selectedText, setSelectedText] = useState(null);
  const [aiAction, setAiAction] = useState(null); // 'summarize', 'explain'
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedArtifact, setGeneratedArtifact] = useState(null);
  const [showArtifactDetail, setShowArtifactDetail] = useState(false);
  const [showAssistantOptions, setShowAssistantOptions] = useState(false);

  const [demoStep, setDemoStep] = useState("idle"); // idle, highlightComplexWord, pulseComplexWord, showAssistantChoicesAndPulseExplain, startGeneratingExplanation, showingExplanation, finished

  // --- DEMO COMPLEX WORD & MOCKS ---
  const demoComplexWord = t("enhancedDemo.demoComplexWord");
  const mockGeneratedExplanation = t("enhancedDemo.mockExplanation");

  // AI Generation Simulation Effect
  useEffect(() => {
    let generationTimer;
    if (isGenerating && aiAction) {
      generationTimer = setTimeout(() => {
        let artifactType = null;
        let artifactContent = null;
        if (aiAction === "explain") {
          artifactType = "explain";
          artifactContent = mockGeneratedExplanation;
        }
        setGeneratedArtifact({
          type: artifactType,
          content: artifactContent,
        });
        setIsGenerating(false);
        // Move to showing the artifact detail after generation
        if (artifactType === "explain") setDemoStep("showingExplanation");
      }, TIMINGS.generate);
    }
    return () => clearTimeout(generationTimer);
  }, [isGenerating, aiAction, mockGeneratedExplanation]);

  // Main Demo Sequence Orchestrator
  useEffect(() => {
    let stepTimer;
    let assistantOptionsTimer;

    if (demoStep === "idle") {
      // Reset all states for a clean start or loop
      setSelectedText(null);
      setAiAction(null);
      setIsGenerating(false);
      setGeneratedArtifact(null);
      setShowArtifactDetail(false);
      setShowAssistantOptions(false);
      stepTimer = setTimeout(
        () => setDemoStep("pulseComplexWord"),
        TIMINGS.idle
      );
    }

    if (demoStep === "pulseComplexWord") {
      setSelectedText(demoComplexWord);

      assistantOptionsTimer = setTimeout(() => {
        setShowAssistantOptions(true);
      }, TIMINGS.assistantAppearDelay);

      stepTimer = setTimeout(
        () => setDemoStep("showAssistantChoicesAndPulseExplain"),
        TIMINGS.selectingText
      );
    }

    if (demoStep === "showAssistantChoicesAndPulseExplain") {
      stepTimer = setTimeout(
        () => setDemoStep("startGeneratingExplanation"),
        TIMINGS.selectingText
      );
    }

    if (demoStep === "startGeneratingExplanation") {
      // Assuming selectedText is still demoComplexWord
      setAiAction("explain");
      setIsGenerating(true);
      // Generation effect in another useEffect will move to 'showingExplanation'
    }

    if (demoStep === "showingExplanation") {
      setShowArtifactDetail(true); // Show the detail of the explanation
      stepTimer = setTimeout(() => {
        setDemoStep("finished");
      }, TIMINGS.showDetail); // Show explanation detail
    }

    if (demoStep === "finished") {
      stepTimer = setTimeout(() => setDemoStep("idle"), TIMINGS.loopPause); // Loop after a pause
    }

    return () => {
      clearTimeout(stepTimer);
      clearTimeout(assistantOptionsTimer);
    };
  }, [demoStep, demoComplexWord]);

  // --- UI SECTIONS ---

  const renderDocumentViewer = () => (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6">
      <div className="text-center mb-8 md:mb-10">
        <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
          {t("enhancedDemo.mainTitle")}
        </h3>
        <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
          {t("enhancedDemo.mainSubtitle")}
        </p>
      </div>

      {/* Main container - single box with flex layout */}
      <div className="bg-white rounded-xl shadow-lg border border-stone-200/80 relative overflow-hidden">
        {/* This flex container for columns now has h-full */}
        <div className="flex h-full">
          {/* Document content - left side */}
          <div className="w-1/2 md:flex-1 p-4 border-r border-stone-200">
            <h4 className="text-base font-semibold text-stone-700 mb-3">
              {t("enhancedDemo.documentTitle")}
            </h4>
            <div className="space-y-3 text-sm text-stone-600 leading-relaxed md:min-h-80 overflow-y-auto px-1">
              {placeholderDocumentText.map((paragraph, index) => (
                <p
                  key={index}
                  className={`transition-all duration-300 p-1 rounded ${
                    index === 0 || index === 2 ? "hidden md:block" : ""
                  }`}
                >
                  {paragraph.split(" ").map((word, wIdx, wordsArray) => {
                    const cleanWord = word.replace(/[^A-Za-z0-9']/g, "");
                    const isSelectedWord = cleanWord === selectedText;
                    let spanClassName;
                    if (isSelectedWord) {
                      if (demoStep === "pulseComplexWord") {
                        // Pulsing state: more prominent amber, vibrant ring
                        spanClassName =
                          "bg-amber-200 rounded px-1 animate-pulse ring-2 ring-amber-500 ring-offset-1 transition-all duration-150";
                      } else {
                        // Just selected, no pulse: standard blue highlight
                        spanClassName =
                          "bg-blue-200 rounded px-1 transition-all duration-150";
                      }
                    } else {
                      spanClassName = ""; // Not selected
                    }
                    return (
                      <>
                        <span className={spanClassName}>{word}</span>
                        {wIdx < wordsArray.length - 1 && " "}
                      </>
                    );
                  })}
                </p>
              ))}
            </div>
          </div>

          {/* Document Assistant - right side - REMOVED style={{ minHeight: '100%' }} */}
          <div className="w-1/2 md:w-80 bg-stone-50 flex flex-col">
            <div className="p-3 border-b border-stone-200 bg-stone-100">
              <h4 className="text-sm font-semibold text-stone-700">
                {t("enhancedDemo.assistantTitle")}
              </h4>
            </div>

            <div className="flex-1 p-3 overflow-y-auto relative">
              {/* Initial Prompt Section */}
              <div
                className={`absolute inset-0 p-3 ${
                  !selectedText && !generatedArtifact
                    ? "animate-fadeIn"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                {!selectedText && !generatedArtifact && (
                  <div className="text-center text-stone-500 text-sm py-6">
                    <FileText
                      size={24}
                      className="mx-auto mb-2 text-stone-400"
                    />
                    {t("enhancedDemo.panelPrompt")}
                  </div>
                )}
              </div>

              {/* Action Buttons Section */}
              <div
                className={`absolute inset-0 p-3 ${
                  selectedText &&
                  showAssistantOptions &&
                  !generatedArtifact &&
                  !isGenerating
                    ? "animate-fadeIn"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                {selectedText &&
                  showAssistantOptions &&
                  !generatedArtifact &&
                  !isGenerating && (
                    <>
                      <p className="text-sm font-semibold text-stone-700 mb-2">
                        {t("enhancedDemo.generateNewArtifact")}
                      </p>
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2 flex items-center gap-2 text-blue-700 text-xs font-medium mb-4">
                        <FileText size={16} className="flex-shrink-0" />
                        <span>{t("enhancedDemo.selectedTextBadge")}</span>
                      </div>
                      <div className="space-y-2">
                        <div
                          className={`rounded-lg p-3 transition-all duration-150 ${
                            demoStep === "showAssistantChoicesAndPulseExplain"
                              ? "border border-amber-500 bg-amber-100 animate-pulse ring-2 ring-amber-500 ring-offset-1 shadow-md"
                              : "border border-stone-200 hover:border-stone-400"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <h5 className="text-sm font-semibold text-stone-800">
                              {t("enhancedDemo.explanationArtifact")}
                            </h5>
                          </div>
                          <p className="text-xs text-stone-600 mt-1">
                            {t("enhancedDemo.explanationDescription")}
                          </p>
                        </div>
                        <div className="border border-stone-200 rounded-lg p-3 hover:border-stone-400 transition">
                          <div className="flex justify-between items-center">
                            <h5 className="text-sm font-semibold text-stone-800">
                              {t("enhancedDemo.summaryArtifact")}
                            </h5>
                          </div>
                          <p className="text-xs text-stone-600 mt-1">
                            {t("enhancedDemo.summaryDescription")}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
              </div>

              {/* Loading Section */}
              <div
                className={`absolute inset-0 p-3 ${
                  isGenerating
                    ? "animate-fadeIn"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                {isGenerating && (
                  <div className="text-center py-6">
                    <Loader
                      size={24}
                      className="mx-auto mb-2 text-stone-500 animate-spin"
                    />
                    <p className="text-sm text-stone-600 font-medium">
                      {aiAction === "explain"
                        ? t("enhancedDemo.generatingExplanation")
                        : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* Generated Artifact Preview Section */}
              <div
                className={`absolute inset-0 p-3 ${
                  generatedArtifact && !showArtifactDetail
                    ? "animate-fadeIn"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                {generatedArtifact && !showArtifactDetail && (
                  <div className="bg-white p-3 rounded-lg shadow-sm border border-stone-200">
                    <p className="text-xs text-stone-500 mb-0.5">
                      {generatedArtifact.type === "explain"
                        ? t("enhancedDemo.explanationArtifact")
                        : ""}
                    </p>
                    <p className="text-sm font-medium text-stone-700 truncate">
                      {generatedArtifact.content.substring(0, 50)}...
                    </p>
                    <div className="text-xs text-stone-600 mt-1 flex items-center font-medium">
                      {t("enhancedDemo.viewDetail")}
                      <ChevronRight size={14} className="ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Generated Artifact Detail Section */}
              <div
                className={`absolute inset-0 p-3 ${
                  generatedArtifact && showArtifactDetail
                    ? "animate-fadeIn"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                {generatedArtifact && showArtifactDetail && (
                  <div className="bg-white p-3 rounded-lg shadow-sm border border-stone-200">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="text-sm font-semibold text-stone-700">
                        {generatedArtifact.type === "explain"
                          ? t("enhancedDemo.explanationArtifact")
                          : ""}
                      </h5>
                    </div>
                    <p className="text-sm text-stone-700 max-h-48 overflow-y-auto pr-1 mb-2">
                      {generatedArtifact.content}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* TTS controls - styled as a footer */}
            <div className="p-3 border-t border-stone-200 bg-stone-50">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-stone-700">
                    {t("enhancedDemo.documentAudio")}
                  </p>
                  {/* Counter was already removed */}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex space-x-2">
                    <button
                      disabled
                      className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-md text-stone-600 transition-colors disabled:opacity-50"
                      aria-label={t("enhancedDemo.rewind")}
                    >
                      <Rewind size={14} />
                    </button>

                    <button
                      disabled
                      className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-md text-stone-600 transition-colors disabled:opacity-50"
                      aria-label={t("enhancedDemo.playTts")}
                    >
                      <Play size={14} />
                    </button>

                    <button
                      disabled
                      className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-md text-stone-600 transition-colors disabled:opacity-50"
                      aria-label={t("enhancedDemo.fastForward")}
                    >
                      <FastForward size={14} />
                    </button>
                  </div>

                  <button
                    disabled
                    className="p-1.5 bg-stone-100 hover:bg-stone-200 rounded-md text-stone-600 transition-colors disabled:opacity-50"
                    aria-label={t("enhancedDemo.mute")}
                  >
                    <VolumeX size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return renderDocumentViewer();
};

export default EnhancedDocumentEngagementDemo;

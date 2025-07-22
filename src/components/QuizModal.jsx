import { useState, useEffect, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import PropTypes from "prop-types";
import { auth, db, storage } from "../utils/firebase";
import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";
import {
  XCircle,
  CheckCircle,
  Info,
  Star,
  SendHorizonal,
  Award,
  ChevronRight,
  AlertCircle,
  X,
  RotateCcw,
  Shuffle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

// Helper component to render text that might contain LaTeX
function LatexRenderer({ text }) {
  if (!text) return null;

  // Check if the text contains LaTeX delimiters ($)
  if (!text.includes("$")) {
    return <span>{text}</span>;
  }

  // Split the text by LaTeX delimiters
  const parts = text.split(/(\$.*?\$)/g);

  return (
    <span>
      {parts.map((part, index) => {
        if (part.startsWith("$") && part.endsWith("$")) {
          // This is a LaTeX formula - remove the $ delimiters
          const formula = part.slice(1, -1);
          return <InlineMath key={index} math={formula} />;
        } else {
          // This is regular text
          return <span key={index}>{part}</span>;
        }
      })}
    </span>
  );
}

// Add PropTypes for the LatexRenderer component
LatexRenderer.propTypes = {
  text: PropTypes.string.isRequired,
};

export default function QuizModal({ docId, isOpen, onClose }) {
  const { t } = useTranslation();
  const [originalQuestions, setOriginalQuestions] = useState(null);
  const [questionIndices, setQuestionIndices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [randomMode, setRandomMode] = useState(false);
  const [animateQuestion, setAnimateQuestion] = useState(false);
  const [animateFeedback, setAnimateFeedback] = useState(false);
  const [exitingModal, setExitingModal] = useState(false);

  // Add CSS keyframes for animations
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        50% { transform: translateX(5px); }
        75% { transform: translateX(-5px); }
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    `;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Handle close/exit from quiz with animation
  const handleClose = useCallback(() => {
    console.log("Close quiz triggered");
    setExitingModal(true);
    // Delay actual close to allow animation to play
    setTimeout(() => {
      onClose();
      setExitingModal(false);
    }, 300);
  }, [onClose]);

  // Toggle random mode
  const toggleRandomMode = () => {
    const newRandomMode = !randomMode;
    setRandomMode(newRandomMode);

    if (originalQuestions) {
      // If switching to random mode, shuffle the question indices
      if (newRandomMode) {
        shuffleQuestions();
      } else {
        // If switching back to sequential mode, use sequential indices
        const sequentialIndices = Array.from(
          { length: originalQuestions.length },
          (_, i) => i
        );
        setQuestionIndices(sequentialIndices);
      }
    }
  };

  // Function to shuffle questions by creating a randomized array of indices
  const shuffleQuestions = () => {
    if (!originalQuestions) return;

    // Create array of indices and shuffle it
    const indices = Array.from(
      { length: originalQuestions.length },
      (_, i) => i
    );

    // Fisher-Yates shuffle algorithm
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    setQuestionIndices(indices);
  };

  // Handle ESC key for modal close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent scrolling of the body when modal is open
      document.body.style.overflow = "hidden";
      // When modal opens, trigger question animation
      setAnimateQuestion(true);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        // Restore scrolling when modal is closed
        document.body.style.overflow = "";
      };
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleClose]);

  // Fetch quiz data
  useEffect(() => {
    if (!isOpen) return;

    console.log("QuizModal useEffect triggered to fetch quiz data");
    setLoading(true);

    async function fetchQuizData() {
      console.log("Starting fetchQuizData");

      if (!auth.currentUser) {
        console.error("No auth.currentUser found");
        setError(t("quizModal.errors.notAuthenticated"));
        setLoading(false);
        return;
      }

      try {
        console.log("Attempting to get quiz data for document:", docId);
        // First, get the storage path from the document
        const docRef = doc(db, "users", auth.currentUser.uid, "docs", docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists() || !docSnap.data().quiz) {
          console.error("Document or quiz not found:", docId);
          setError(t("quizModal.errors.quizNotFound"));
          setLoading(false);
          return;
        }

        const quizInfo = docSnap.data().quiz;

        if (quizInfo.status !== "completed") {
          console.error("Quiz generation is not completed:", quizInfo.status);
          setError(
            t("quizModal.errors.quizNotCompleted", { status: quizInfo.status })
          );
          setLoading(false);
          return;
        }

        // Get the path to the JSON file
        const storagePath = quizInfo.storagePath;

        // Download the JSON file from storage
        const storageRef = ref(storage, storagePath);
        const url = await getDownloadURL(storageRef);

        // Fetch the JSON content
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(t("quizModal.errors.fetchFailed"));
        }

        const quiz = await response.json();
        console.log(
          "Quiz data successfully loaded with",
          quiz.questions?.length || 0,
          "questions"
        );

        // Store original questions to allow resetting
        setOriginalQuestions(quiz.questions);

        // Initialize question indices (either sequential or random)
        const indices = Array.from(
          { length: quiz.questions.length },
          (_, i) => i
        );

        // If random mode is enabled, shuffle the indices
        if (randomMode) {
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
          }
        }

        setQuestionIndices(indices);
        setLoading(false);
        // Trigger animation when questions load
        setAnimateQuestion(true);
      } catch (err) {
        console.error("Error fetching quiz:", err);
        setError(`${t("quizModal.errors.loadingError")} ${err.message}`);
        setLoading(false);
      }
    }

    fetchQuizData();
  }, [docId, isOpen, randomMode, t]); // Add `t` to dependency array

  // Get the current question based on current index and question indices
  const getCurrentQuestion = () => {
    if (!originalQuestions || !questionIndices.length) return null;

    // Get the real question index from our array of indices
    const questionIndex = questionIndices[currentQuestionIndex];
    return originalQuestions[questionIndex];
  };

  // Handle option selection
  const handleOptionSelect = (option) => {
    if (isAnswered) return;
    setSelectedOption(option);
  };

  // Handle text input change
  const handleTextInputChange = (e) => {
    if (isAnswered) return;
    setTextInput(e.target.value);
  };

  // Check answer
  const checkAnswer = () => {
    if (isAnswered) return;

    const currentQuestion = getCurrentQuestion();
    if (!currentQuestion) return;

    // Handle different question types
    if (
      (currentQuestion.type === "fill-in-the-blank" ||
        currentQuestion.type === "fill-in-blank") &&
      (!currentQuestion.options || currentQuestion.options.length <= 1)
    ) {
      if (!textInput.trim()) return; // Don't check empty answers

      // Case insensitive match for fill-in-the-blank
      const isCorrectAnswer =
        textInput.trim().toLowerCase() ===
        currentQuestion.correctAnswer.toLowerCase();
      setIsCorrect(isCorrectAnswer);
      setIsAnswered(true);

      if (isCorrectAnswer) {
        setScore(score + 10); // Add 10 points for correct answer
      } else {
        setScore(Math.max(0, score - 5)); // Subtract 5 points for wrong answer, but don't go below 0
      }
    } else {
      // For multiple choice, true-false types, and fill-in-blank with multiple options
      if (!selectedOption) return;

      // First check if it's a simple True/False option without a letter prefix
      if (currentQuestion.type === "true-false") {
        // Direct true/false handling
        const normalizedSelected = selectedOption.trim().toLowerCase();
        const isTrueSelected = normalizedSelected === "true";
        const isFalseSelected = normalizedSelected === "false";

        // If it's a direct True/False text
        if (isTrueSelected || isFalseSelected) {
          const correct =
            (isTrueSelected &&
              currentQuestion.correctAnswer.toLowerCase() === "true") ||
            (isFalseSelected &&
              currentQuestion.correctAnswer.toLowerCase() === "false");

          setIsCorrect(correct);
          setIsAnswered(true);

          if (correct) {
            setScore(score + 10); // Add 10 points for correct answer
          } else {
            setScore(Math.max(0, score - 5)); // Subtract 5 points for wrong answer, but don't go below 0
          }

          // Trigger feedback animation
          setAnimateFeedback(true);
          return;
        }
      }

      // Handle the case where correctAnswer includes the prefix (e.g., "D. Plasma")
      const selectedLetter =
        selectedOption.match(/^([A-Z])[.:|)]?\s*/)?.[1] || "";

      // Check if the correctAnswer is a full option or just a letter
      const correct =
        currentQuestion.correctAnswer === selectedOption ||
        currentQuestion.correctAnswer === selectedLetter;

      setIsCorrect(correct);
      setIsAnswered(true);

      if (correct) {
        setScore(score + 10); // Add 10 points for correct answer
      } else {
        setScore(Math.max(0, score - 5)); // Subtract 5 points for wrong answer, but don't go below 0
      }
    }

    // Trigger feedback animation
    setAnimateFeedback(true);
  };

  // Move to next question
  const nextQuestion = () => {
    if (currentQuestionIndex >= questionIndices.length - 1) {
      setQuizCompleted(true);
      return;
    }

    // First fade out current question
    setAnimateQuestion(false);

    // Short delay before moving to next question
    setTimeout(() => {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedOption(null);
      setTextInput("");
      setIsAnswered(false);
      setIsCorrect(false);
      setAnimateFeedback(false);

      // Trigger fade in of new question
      setAnimateQuestion(true);
    }, 300);
  };

  // Reset quiz state
  const resetQuiz = () => {
    // If in random mode, shuffle the questions again
    if (randomMode && originalQuestions) {
      shuffleQuestions();
    }

    setAnimateQuestion(false);

    setTimeout(() => {
      setCurrentQuestionIndex(0);
      setSelectedOption(null);
      setTextInput("");
      setIsAnswered(false);
      setScore(0);
      setQuizCompleted(false);
      setAnimateFeedback(false);
      setAnimateQuestion(true);
    }, 300);
  };

  // Confirm reset if in the middle of the quiz
  const confirmResetQuiz = () => {
    if (currentQuestionIndex > 0 || isAnswered) {
      if (window.confirm(t("quizModal.confirmReset"))) {
        resetQuiz();
      }
    } else {
      resetQuiz();
    }
  };

  // Render the current question
  const renderCurrentQuestion = () => {
    if (!originalQuestions || questionIndices.length === 0) return null;

    const question = getCurrentQuestion();
    if (!question) return null;

    const getQuestionTypeDescription = (type) => {
      switch (type) {
        case "multiple-choice":
          return t("quizModal.questionType.multipleChoice");
        case "fill-in-blank":
        case "fill-in-the-blank":
          return t("quizModal.questionType.fillInBlank");
        case "true-false":
          return t("quizModal.questionType.trueFalse");
        default:
          return ""; // Or a default description
      }
    };

    return (
      <div
        className={`flex flex-col gap-5 transition-all duration-300 ease-out ${animateQuestion ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
      >
        <div className="question-header p-4 bg-stone-50 border border-stone-200 rounded-lg shadow-sm transition-all duration-300">
          <h2 className="text-xl font-medium text-stone-800 mb-2">
            <LatexRenderer text={question.question} />
          </h2>
          <p className="text-sm text-stone-500">
            {getQuestionTypeDescription(question.type)}
          </p>
        </div>

        {/* Render appropriate input based on question type */}
        {(question.type === "fill-in-blank" ||
          question.type === "fill-in-the-blank") &&
        (!question.options || question.options.length <= 1) ? (
          <div className="fill-in-blank-container bg-white border border-stone-200 p-4 rounded-lg shadow-sm transition-all duration-300">
            <input
              type="text"
              value={textInput}
              onChange={handleTextInputChange}
              disabled={isAnswered}
              placeholder={t("quizModal.fillInBlankPlaceholder")}
              className={`w-full p-3 rounded-md border transition focus:outline-none focus:ring-2 focus:ring-stone-300 ${
                isAnswered
                  ? isCorrect
                    ? "bg-green-50 border-green-300 text-green-900 ring-green-200"
                    : "bg-stone-100 border-stone-300 text-stone-900"
                  : "border-stone-200 focus:border-stone-400"
              }`}
            />

            {isAnswered && (
              <div
                className={`mt-3 flex items-start transition-all duration-300 ${animateFeedback ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              >
                {isCorrect ? (
                  <CheckCircle
                    className="text-green-600 mr-2 mt-0.5 flex-shrink-0 animate-[bounce_0.5s_ease-out]"
                    size={18}
                  />
                ) : (
                  <XCircle
                    className="text-stone-500 mr-2 mt-0.5 flex-shrink-0 animate-[shake_0.5s_ease-out]"
                    size={18}
                  />
                )}
                <span
                  className={`text-sm ${isCorrect ? "text-green-700" : "text-stone-700"}`}
                >
                  {isCorrect
                    ? t("quizModal.feedback.correctPoints", { points: 10 })
                    : t("quizModal.feedback.incorrectIs")}
                  {!isCorrect && (
                    <strong className="font-bold">
                      <LatexRenderer text={question.correctAnswer} />
                    </strong>
                  )}
                </span>
              </div>
            )}
          </div>
        ) : (
          // For multiple choice and true-false types, or fill-in-blank with multiple options
          <div className="options-container p-4 bg-white border border-stone-200 rounded-lg shadow-sm transition-all duration-300">
            <div className="flex flex-col gap-2">
              {question.options.map((option, index) => {
                const isSelected = selectedOption === option;

                // Extract letter from option if it has a prefix format (A), A., A:, etc.
                // This works even if the option contains LaTeX markup
                const optionLetter =
                  option.match(/^([A-Z])[.:|)]?\s*/)?.[1] || "";

                // Check if this option is the correct one, using same logic as checkAnswer
                const isCorrectOption =
                  option === question.correctAnswer ||
                  (optionLetter && optionLetter === question.correctAnswer) ||
                  // Handle the case for true/false questions where the correct answer might be just "True" or "False"
                  (question.type === "true-false" &&
                    option.trim().toLowerCase() ===
                      question.correctAnswer.toLowerCase());

                const delay = index * 0.1; // Staggered animation delay

                return (
                  <button
                    key={index}
                    onClick={() => handleOptionSelect(option)}
                    className={`p-3 rounded-md text-left transition-all duration-300 ease-out transform ${
                      isSelected
                        ? isAnswered
                          ? isCorrect
                            ? "bg-green-50 border border-green-300 scale-[1.02]"
                            : "bg-stone-100 border border-stone-300"
                          : "bg-stone-100 border border-stone-300 scale-[1.02]"
                        : isAnswered && isCorrectOption
                          ? "bg-green-50 border border-green-300"
                          : "bg-white border border-stone-200 hover:bg-stone-50 hover:border-stone-300 hover:scale-[1.01]"
                    }`}
                    style={{
                      opacity: 0,
                      animation: `fadeIn 0.3s ${delay}s ease-out forwards`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`${isAnswered ? (isSelected && !isCorrect ? "text-stone-800" : isCorrectOption ? "text-green-800" : "text-stone-700") : "text-stone-700"}`}
                      >
                        <LatexRenderer text={option} />
                      </span>
                      {isAnswered &&
                        (isSelected ? (
                          isCorrect ? (
                            <CheckCircle
                              className="text-green-600 animate-[bounce_0.5s_ease-out]"
                              size={20}
                            />
                          ) : (
                            <XCircle
                              className="text-stone-500 animate-[shake_0.5s_ease-out]"
                              size={20}
                            />
                          )
                        ) : isCorrectOption ? (
                          <CheckCircle
                            className="text-green-600 animate-[pulse_1s_ease-in-out_infinite]"
                            size={20}
                          />
                        ) : null)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Explanation - always shown when answered */}
        {isAnswered && (
          <div
            className={`explanation bg-white border p-4 rounded-lg shadow-sm transition-all duration-500 ease-out ${
              animateFeedback
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            } ${isCorrect ? "border-green-200" : "border-stone-200"}`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-md ${isCorrect ? "bg-green-100" : "bg-stone-100"}`}
              >
                {isCorrect ? (
                  <CheckCircle
                    className="text-green-600 flex-shrink-0 animate-[pulse_2s_ease-in-out_infinite]"
                    size={20}
                  />
                ) : (
                  <XCircle className="text-stone-500 flex-shrink-0" size={20} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center mb-2">
                  <h3
                    className={`font-medium ${isCorrect ? "text-green-700" : "text-stone-700"}`}
                  >
                    {isCorrect
                      ? t("quizModal.feedback.correctPoints", { points: 10 })
                      : t("quizModal.feedback.incorrectPoints", { points: 5 })}
                  </h3>
                </div>

                <div className="bg-stone-50 p-3 rounded-md border border-stone-200">
                  <div className="flex items-center mb-1.5">
                    <Info size={16} className="text-stone-500 mr-2" />
                    <span className="text-sm font-medium text-stone-700">
                      {t("quizModal.explanationTitle")}
                    </span>
                  </div>
                  <p className="text-sm text-stone-600">
                    <LatexRenderer text={question.explanation} />
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render completion screen
  const renderCompletionScreen = () => {
    const totalQuestions = originalQuestions ? originalQuestions.length : 0;
    const completedQuestions = currentQuestionIndex + 1;
    const maxPossibleScore = totalQuestions * 10;
    const successRate = Math.round((score / maxPossibleScore) * 100);

    // Determine success color based on score percentage
    const getSuccessColor = () => {
      if (successRate >= 80) return "text-green-600";
      if (successRate >= 60) return "text-green-500";
      if (successRate >= 40) return "text-stone-600";
      return "text-stone-500";
    };

    return (
      <div className="flex flex-col items-center text-center gap-6 py-6 animate-[fadeIn_0.6s_ease-out]">
        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center shadow-sm mb-2 animate-[bounce_1s_ease-out]">
          <Award
            className={`${getSuccessColor()} animate-[pulse_3s_ease-in-out_infinite]`}
            size={40}
          />
        </div>

        <h2 className="text-xl font-semibold text-stone-800">
          {t("quizModal.completion.title")}
        </h2>

        <div className="stats flex flex-col gap-3 w-full max-w-xs">
          {[
            {
              label: t("quizModal.completion.scoreLabel"),
              value: score,
              valueClass: getSuccessColor(),
            },
            {
              label: t("quizModal.completion.questionsLabel"),
              value: t("quizModal.completion.questionsValue", {
                completed: completedQuestions,
                total: totalQuestions,
              }),
              valueClass: "text-stone-800",
            },
            {
              label: t("quizModal.completion.successRateLabel"),
              value: `${successRate}%`,
              valueClass: getSuccessColor(),
            },
            {
              label: t("quizModal.completion.maxScoreLabel"),
              value: t("quizModal.completion.maxScoreValue", {
                points: maxPossibleScore,
              }),
              valueClass: "text-stone-800",
            },
          ].map((stat, index) => (
            <div
              key={stat.label}
              className="stat p-4 bg-white border border-stone-200 rounded-lg flex justify-between items-center shadow-sm transition-all duration-300 hover:shadow-md transform hover:-translate-y-0.5"
              style={{
                opacity: 0,
                animation: `fadeIn 0.5s ${index * 0.15}s ease-out forwards`,
              }}
            >
              <span className="text-stone-600">{stat.label}</span>
              <span className={`font-medium text-lg ${stat.valueClass}`}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs mt-4">
          <button
            onClick={resetQuiz}
            className="w-full p-3 bg-stone-700 text-white rounded-md font-medium hover:bg-stone-800 transition shadow-sm transform hover:scale-[1.02] active:scale-[0.98] duration-300 ease-out"
            style={{
              animation: "fadeIn 0.5s 0.6s ease-out forwards",
              opacity: 0,
            }}
          >
            {t("quizModal.completion.tryAgainButton")}
          </button>

          <button
            onClick={handleClose}
            className="w-full p-3 bg-white border border-stone-300 rounded-md font-medium text-stone-700 hover:bg-stone-50 transition shadow-sm transform hover:scale-[1.02] active:scale-[0.98] duration-300 ease-out"
            style={{
              animation: "fadeIn 0.5s 0.75s ease-out forwards",
              opacity: 0,
            }}
          >
            {t("quizModal.completion.backButton")}
          </button>
        </div>
      </div>
    );
  };

  // Early return if modal is not open
  if (!isOpen) return null;

  // Content to render when loading
  const loadingContent = (
    <div className="flex items-center justify-center min-h-screen bg-stone-50">
      <div className="text-center p-8 bg-white rounded-lg border border-stone-200 shadow-sm animate-[fadeIn_0.4s_ease-out]">
        <div className="w-16 h-16 border-4 border-stone-300 border-t-stone-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-stone-600">{t("quizModal.loading")}</p>
      </div>
    </div>
  );

  // Content to render when there's an error
  const errorContent = (
    <div className="flex items-center justify-center min-h-screen bg-stone-50 p-4">
      <div className="text-center max-w-md p-8 bg-white rounded-lg border border-stone-200 shadow-sm animate-[fadeIn_0.4s_ease-out]">
        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle
            className="text-stone-600 animate-[pulse_2s_ease-in-out_infinite]"
            size={28}
          />
        </div>
        <h2 className="text-xl font-medium mb-3 text-stone-800">
          {t("quizModal.errors.loadingTitle")}
        </h2>
        <p className="text-stone-600 mb-6">{error}</p>
        <button
          onClick={handleClose}
          className="px-5 py-2.5 bg-stone-700 text-white rounded-md hover:bg-stone-800 transition shadow-sm transform hover:scale-[1.02] active:scale-[0.98] duration-300 ease-out"
        >
          {t("quizModal.errors.backButton")}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${exitingModal ? "opacity-0" : "opacity-100"}`}
    >
      <div
        className={`h-full w-full flex flex-col bg-stone-50 transition-all duration-300 ${exitingModal ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
      >
        {/* Header - Updated to match the style of FlashcardModal & MindMapModal */}
        <div className="w-full border-b bg-white shadow-sm">
          <div className="max-w-7xl w-full mx-auto p-3 md:p-4">
            <div className="flex justify-between items-start md:items-center">
              <div className="flex flex-col md:flex-row md:items-center md:gap-6">
                <h2 className="text-lg md:text-xl font-medium text-stone-800">
                  {t("quizModal.title")}
                </h2>
                {!loading && !error && !quizCompleted && (
                  <div className="text-sm text-stone-500 mt-0.5 md:mt-0">
                    {t("quizModal.header.progress", {
                      current: currentQuestionIndex + 1,
                      total: questionIndices.length,
                    })}{" "}
                    •{" "}
                    <span className="bg-stone-100 px-2 py-0.5 rounded text-stone-600 inline-flex items-center">
                      <Star className="mr-1 w-3 h-3" />
                      {t("quizModal.header.points", { score })}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {!loading && !error && (
                  <>
                    <div className="flex items-center">
                      <button
                        onClick={toggleRandomMode}
                        title={t("quizModal.header.randomizeTooltip")}
                        className="p-1.5 md:p-2 text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors duration-200"
                      >
                        <Shuffle
                          className={`w-4 h-4 md:w-5 md:h-5 transition-transform duration-300 ${randomMode ? "rotate-180" : ""}`}
                        />
                      </button>
                    </div>
                    {!quizCompleted && (
                      <button
                        onClick={confirmResetQuiz}
                        className="p-1.5 md:p-2 text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors duration-200"
                        title={t("quizModal.header.resetTooltip")}
                      >
                        <RotateCcw className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-300 hover:-rotate-180" />
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={handleClose}
                  className="p-1.5 md:p-2 text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors duration-200"
                >
                  <X className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {!loading && !error && !quizCompleted && (
          <div className="w-full bg-stone-100 h-1.5 md:h-2 mb-4 md:mb-0">
            <div
              className="bg-stone-500 h-1.5 md:h-2 transition-all duration-700 ease-out"
              style={{
                width: `${(currentQuestionIndex / questionIndices.length) * 100}%`,
              }}
            />
          </div>
        )}

        {/* Main content with conditional rendering based on loading/error state */}
        {loading ? (
          loadingContent
        ) : error ? (
          errorContent
        ) : (
          <div className="flex-1 py-6 overflow-auto">
            <div className="max-w-3xl mx-auto px-4">
              <div className="rounded-lg shadow-sm p-5">
                {!quizCompleted
                  ? renderCurrentQuestion()
                  : renderCompletionScreen()}

                {!quizCompleted && !isAnswered && (
                  <div className="mt-6">
                    <button
                      onClick={checkAnswer}
                      disabled={
                        !getCurrentQuestion() ||
                        ((getCurrentQuestion().type === "fill-in-blank" ||
                          getCurrentQuestion().type === "fill-in-the-blank") &&
                        (!getCurrentQuestion().options ||
                          getCurrentQuestion().options.length <= 1)
                          ? !textInput.trim()
                          : !selectedOption)
                      }
                      className={`w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition-all duration-300 shadow-sm transform hover:scale-[1.01] active:scale-[0.98] group ${
                        getCurrentQuestion() &&
                        ((getCurrentQuestion().type === "fill-in-blank" ||
                          getCurrentQuestion().type === "fill-in-the-blank") &&
                        (!getCurrentQuestion().options ||
                          getCurrentQuestion().options.length <= 1)
                          ? textInput.trim()
                          : selectedOption)
                          ? "bg-stone-700 text-white hover:bg-stone-800"
                          : "bg-stone-200 text-stone-400 cursor-not-allowed"
                      }`}
                    >
                      <span>{t("quizModal.buttons.checkAnswer")}</span>
                      <SendHorizonal
                        size={16}
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </button>
                  </div>
                )}

                {!quizCompleted && isAnswered && (
                  <div className="mt-6 animate-[fadeIn_0.4s_ease-out]">
                    <button
                      onClick={nextQuestion}
                      className={`w-full py-3 rounded-md font-medium transition-all duration-300 flex items-center justify-center gap-2 shadow-sm transform hover:scale-[1.02] active:scale-[0.98] group ${
                        isCorrect
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-stone-700 text-white hover:bg-stone-800"
                      }`}
                    >
                      <span>
                        {currentQuestionIndex === questionIndices.length - 1
                          ? t("quizModal.buttons.finishQuiz")
                          : t("quizModal.buttons.continue")}
                      </span>
                      <ChevronRight
                        size={16}
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Update PropTypes validation
QuizModal.propTypes = {
  docId: PropTypes.string.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

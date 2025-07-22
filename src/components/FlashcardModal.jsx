import { useState, useEffect, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import {
  X,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Eye,
  EyeOff,
  Info,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "./utils/DropdownEditMenu";
import { useTranslation } from "react-i18next";

// Fisher-Yates shuffle algorithm
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const DifficultyBadge = ({ difficulty }) => {
  const { t } = useTranslation();
  const colors = {
    easy: "bg-green-50 text-green-700 border-green-200",
    medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
    hard: "bg-red-50 text-red-700 border-red-200",
  };

  const difficultyKey = `flashcardModal.difficulty.${difficulty}`;

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded border ${colors[difficulty] || "bg-stone-100 text-stone-700 border-stone-200"}`}
    >
      {t(difficultyKey, difficulty)}
    </span>
  );
};

DifficultyBadge.propTypes = {
  difficulty: PropTypes.string.isRequired,
};

const FlashcardModal = ({ isOpen, onClose, flashcards, sourceFiles = [] }) => {
  const { t } = useTranslation();
  const [shuffledCards, setShuffledCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [completedCards, setCompletedCards] = useState(new Set());
  const [exitingModal, setExitingModal] = useState(false);
  const [cardAnimation, setCardAnimation] = useState(true);

  // Add CSS keyframes for animations
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes flipCard {
        0% { transform: rotateY(0deg); }
        100% { transform: rotateY(180deg); }
      }
      @keyframes unflipCard {
        0% { transform: rotateY(180deg); }
        100% { transform: rotateY(0deg); }
      }
      .card-container {
        perspective: 1000px;
      }
      .card-inner {
        transform-style: preserve-3d;
        transition: transform 0.6s;
      }
      .card-front, .card-back {
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      .card-back {
        transform: rotateY(180deg);
      }
      .shadow-transition {
        transition: box-shadow 0.4s ease-in-out, transform 0.3s ease-out;
      }
      .card-press {
        transform: scale(0.995);
      }
      .card-release {
        transform: scale(1);
      }
    `;
    document.head.appendChild(styleElement);

    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Memoize progress calculation
  const progress = useMemo(
    () => (completedCards.size / shuffledCards.length) * 100 || 0,
    [completedCards.size, shuffledCards.length]
  );

  // Handle close with animation

  const handleCloseWithAnimation = () => {
    setExitingModal(true);
    setTimeout(() => {
      onClose();
      setExitingModal(false);
    }, 300);
  };

  // Memoize shuffle function to prevent unnecessary re-renders
  const handleShuffle = useCallback(() => {
    setCardAnimation(false);
    setTimeout(() => {
      const cards = shuffleArray(flashcards);
      setShuffledCards(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setCompletedCards(new Set());
      setCardAnimation(true);
    }, 10);
  }, [flashcards]);

  // Shuffle cards when modal opens
  useEffect(() => {
    if (isOpen) {
      handleShuffle();
    }
  }, [isOpen, handleShuffle]);

  if (!isOpen || shuffledCards.length === 0) return null;

  const currentCard = shuffledCards[currentIndex];

  const handleNext = () => {
    if (currentIndex < shuffledCards.length - 1) {
      setCardAnimation(false);
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
        setIsFlipped(false);
        setCardAnimation(true);
      }, 10);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCardAnimation(false);
      setTimeout(() => {
        setCurrentIndex(currentIndex - 1);
        setIsFlipped(false);
        setCardAnimation(true);
      }, 10);
    }
  };

  const handleFlip = () => {
    // Visual feedback of card being pressed
    const cardElement = document.getElementById("flashcard");
    if (cardElement) {
      cardElement.classList.add("card-press");
      setTimeout(() => {
        cardElement.classList.remove("card-press");
      }, 100);
    }

    setIsFlipped(!isFlipped);
    if (!isFlipped) {
      setCompletedCards(new Set([...completedCards, currentIndex]));
    }
  };

  const handleReset = () => {
    handleShuffle();
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowRight") {
      handleNext();
    } else if (e.key === "ArrowLeft") {
      handlePrevious();
    } else if (e.key === " ") {
      e.preventDefault();
      handleFlip();
    }
  };

  // Define card shadow styles with transition
  const frontShadow =
    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
  const backShadow = "inset 0 2px 8px rgba(0, 0, 0, 0.15)";

  // Define card background styles
  const frontBackground = "bg-white";
  const backBackground = "bg-gradient-to-b from-white to-stone-100";

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${exitingModal ? "opacity-0" : "opacity-100"}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className={`h-full w-full flex flex-col bg-stone-50 transition-all duration-300 ${exitingModal ? "scale-95 opacity-0" : "scale-100 opacity-100"}`}
      >
        {/* Header - Kept minimal to maintain focus */}
        <div className="w-full border-b bg-white shadow-sm">
          <div className="max-w-7xl w-full mx-auto p-3 md:p-4">
            <div className="flex justify-between items-start md:items-center">
              <div className="flex flex-col md:flex-row md:items-center md:gap-6">
                <h2 className="text-lg md:text-xl font-medium text-stone-800">
                  {t("flashcardModal.title")}
                </h2>
                <div className="text-sm text-stone-500 mt-0.5 md:mt-0">
                  {t("flashcardModal.progress", {
                    current: currentIndex + 1,
                    total: shuffledCards.length,
                    percent: Math.round(progress),
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="p-1.5 md:p-2 text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors duration-200"
                  title={t("flashcardModal.shuffleAndRestart")}
                >
                  <RotateCcw className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-300 hover:-rotate-180" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 md:p-2 text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors duration-200"
                      title={t("flashcardModal.sourceFilesTitle")}
                    >
                      <Info className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-[240px] max-w-[calc(100vw-2rem)] z-50 bg-white border border-stone-200 shadow-md rounded-md animate-[fadeIn_0.2s_ease-out]"
                    style={{
                      position: "fixed",
                      top: "var(--radix-dropdown-menu-content-available-height)",
                      right: "1rem",
                    }}
                  >
                    <div className="px-2 py-1.5 text-sm font-medium text-stone-700">
                      {t("flashcardModal.sourceFilesHeader")}
                    </div>
                    {sourceFiles.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-stone-500">
                        {t("flashcardModal.sourceFilesNone")}
                      </div>
                    ) : (
                      sourceFiles.map((file, index) => (
                        <div
                          key={index}
                          className="px-2 py-1.5 text-sm text-stone-600 hover:bg-transparent cursor-default"
                        >
                          {file}
                        </div>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  onClick={handleCloseWithAnimation}
                  className="p-1.5 md:p-2 text-stone-600 hover:text-stone-800 hover:bg-stone-50 rounded-lg transition-colors duration-200"
                >
                  <X className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-stone-100 h-1.5 md:h-2 mb-4 md:mb-0">
          <div
            className="bg-stone-500 h-1.5 md:h-2 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Main study area */}
        <div className="flex-1 flex flex-col md:py-12 bg-stone-50">
          <div className="w-full max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row gap-8 h-full">
            {/* Card area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div
                id="flashcard"
                onClick={handleFlip}
                className={`${cardAnimation ? "animate-[fadeIn_0.4s_ease-out]" : ""} 
                  flex-1 rounded-2xl p-6 md:p-12 
                  flex flex-col items-center justify-center 
                  cursor-pointer select-none 
                  border-2 border-stone-200 
                  shadow-transition
                  ${isFlipped ? backBackground : frontBackground}`}
                style={{
                  boxShadow: isFlipped ? backShadow : frontShadow,
                }}
              >
                <div
                  className={`w-full max-w-4xl mx-auto ${!isFlipped ? "text-center" : ""}`}
                >
                  {/* Display difficulty badge on front */}
                  {!isFlipped && currentCard.difficulty && (
                    <div className="mb-4 flex justify-center">
                      <DifficultyBadge difficulty={currentCard.difficulty} />
                    </div>
                  )}

                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    className={`prose max-w-none ${!isFlipped ? "prose-xl md:prose-2xl" : "prose-lg md:prose-xl"} ${!isFlipped ? "font-medium" : ""}`}
                  >
                    {isFlipped
                      ? currentCard.answer || currentCard.back
                      : currentCard.question || currentCard.front}
                  </ReactMarkdown>
                </div>

                {/* Show hint only on first card */}
                {currentIndex === 0 && (
                  <div className="mt-6 text-sm text-stone-500">
                    <span className="hidden md:inline">
                      {t(
                        `flashcardModal.flipHint.desktop.${isFlipped ? "question" : "answer"}`
                      )}
                    </span>
                    <span className="md:hidden">
                      {t(
                        `flashcardModal.flipHint.mobile.${isFlipped ? "question" : "answer"}`
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation panel */}
            <div className="md:w-48 flex md:flex-col justify-between md:justify-center gap-4 py-4 md:py-0">
              <button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="flex-1 md:flex-none inline-flex items-center justify-center md:justify-start gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-sm transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden md:inline">
                  {t("flashcardModal.previousButton")}
                </span>
              </button>

              <button
                onClick={handleFlip}
                className={`
                  flex-1 md:flex-none px-4 py-2.5 text-sm font-medium rounded-md
                  inline-flex items-center justify-center gap-2
                  transition-all duration-300 shadow-transition transform hover:scale-[1.02] active:scale-[0.98]
                  ${
                    isFlipped
                      ? "text-stone-700 bg-stone-50 border border-stone-200 shadow-inner"
                      : "text-stone-700 bg-white border border-stone-200"
                  }
                `}
              >
                {isFlipped ? (
                  <>
                    <Eye className="w-5 h-5" />
                    <span className="hidden md:inline">
                      {t("flashcardModal.showQuestionButton")}
                    </span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-5 h-5" />
                    <span className="hidden md:inline">
                      {t("flashcardModal.showAnswerButton")}
                    </span>
                  </>
                )}
              </button>

              <button
                onClick={handleNext}
                disabled={currentIndex === shuffledCards.length - 1}
                className="flex-1 md:flex-none inline-flex items-center justify-center md:justify-start gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-sm transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <ArrowRight className="w-5 h-5" />
                <span className="hidden md:inline">
                  {t("flashcardModal.nextButton")}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

FlashcardModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  flashcards: PropTypes.arrayOf(
    PropTypes.shape({
      question: PropTypes.string,
      answer: PropTypes.string,
      front: PropTypes.string,
      back: PropTypes.string,
      difficulty: PropTypes.string,
    })
  ).isRequired,
  sourceFiles: PropTypes.arrayOf(PropTypes.string),
};

export default FlashcardModal;

// Export all http trigger functions
import { generateAudio } from "./audioGenerator.js";
import { processAudioLecture } from "./processAudioLecture.js";
import { generateSummary, generateExplanation } from "./documentAssistant.js";
import { generateFlashcards } from "./flashcardGenerator.js";
import { generateMindmap } from "./mindmapGenerator.js";
import { generateQuiz } from "./quizGenerator.js";
import { generateChatResponse } from "./chatGenerator.js";
import { sendFeedbackEmail } from "./feedbackHandler.js";
import { convertMermaidToXmind } from "./mindmapConverter.js";
import { deleteUserAccount } from "./deleteUserAccount.js";

export {
  generateAudio,
  processAudioLecture,
  generateSummary,
  generateExplanation,
  generateFlashcards,
  generateMindmap,
  generateQuiz,
  generateChatResponse,
  sendFeedbackEmail,
  convertMermaidToXmind,
  deleteUserAccount,
};

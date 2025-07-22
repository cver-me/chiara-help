import admin from "firebase-admin";
import { onFileUpload, onFileDelete } from "./triggers/storage/index.js";
import {
  processAudioLecture,
  generateAudio,
  generateSummary,
  generateExplanation,
  generateFlashcards,
  generateMindmap,
  generateQuiz,
  generateChatResponse,
  sendFeedbackEmail,
  convertMermaidToXmind,
  deleteUserAccount,
} from "./triggers/http/index.js";
import {
  processPdfDocumentTask,
  processAudioTranscription,
  processAudioConversion,
  processAudioGeneration,
} from "./triggers/pubsub/index.js";

admin.initializeApp();

export {
  onFileUpload,
  onFileDelete,
  processAudioLecture,
  generateAudio,
  processPdfDocumentTask,
  processAudioTranscription,
  processAudioConversion,
  processAudioGeneration,
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

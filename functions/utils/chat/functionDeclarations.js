// functions/utils/functionDeclarations.js

import { Type } from "@google/genai";

/**
 * Shared function declarations for all agents
 */

// Document search function declaration - to be used by all agents that need access to documents
export const searchDocumentsFunctionDeclaration = {
  name: "search_documents",
  description:
    "Search for information in the student's course materials to answer their question or enhance explanations",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          "The search query to find relevant information in course materials",
      },
      detail_level: {
        type: Type.STRING,
        description: "The level of detail desired in the search results",
        enum: ["basic", "moderate", "comprehensive"],
      },
    },
    required: ["query"],
  },
};

// Router function declaration for initial classification (updated focus)
export const routerFunctionDeclarations = [
  {
    name: "select_agent",
    description:
      "Select the appropriate specialized agent based on user request",
    parameters: {
      type: Type.OBJECT,
      properties: {
        agent_type: {
          type: Type.STRING,
          description: "The type of agent that should handle this request",
          enum: ["question_answering", "explanation", "general"],
        },
        reasoning: {
          type: Type.STRING,
          description: "Explanation for why this agent was selected",
        },
        detected_language: {
          type: Type.STRING,
          description:
            "The language detected in the user query (e.g., 'english', 'italian', etc.)",
        },
        likely_needs_documents: {
          type: Type.BOOLEAN,
          description:
            "Whether the question likely requires searching course materials",
        },
      },
      required: ["agent_type", "reasoning", "detected_language"],
    },
  },
];

/**
 * Default preferences to use when user preferences aren't available
 */
const defaultPreferences = {
  learningPreferences: {
    contentComplexity: "balanced",
    examplesPreference: "balanced",
    contentLength: "balanced",
  },
  contentFormatPreferences: {
    prefersBulletPoints: false,
    prefersNumberedLists: false,
    prefersHeadings: true, // Default to true for structure
    prefersHighlighting: false,
  },
  // learningDisabilities: { hasDyslexia: false, hasADHD: false } // Excluded for now
};

/**
 * Fetches user preferences from Firestore.
 * @param {string} userId - The user's ID.
 * @param {FirebaseFirestore.Firestore} db - Firestore instance.
 * @returns {Promise<object>} User preferences object or default if not found/error.
 */
async function fetchUserPreferences(userId, db) {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.log(
        `User document not found for userId: ${userId}. Using default preferences.`
      );
      return defaultPreferences;
    }

    const userData = userDoc.data();
    // Merge fetched preferences with defaults to ensure all keys exist
    const preferences = {
      learningPreferences: {
        ...defaultPreferences.learningPreferences,
        ...(userData.learningPreferences || {}),
      },
      contentFormatPreferences: {
        ...defaultPreferences.contentFormatPreferences,
        ...(userData.contentFormatPreferences || {}),
      },
      // learningDisabilities: {
      //   ...defaultPreferences.learningDisabilities,
      //   ...(userData.learningDisabilities || {}),
      // } // Excluded for now
    };
    console.log(`Fetched preferences for userId: ${userId}`, preferences);
    return preferences;
  } catch (error) {
    console.warn(
      `Error fetching preferences for userId: ${userId}. Using default preferences.`,
      error
    );
    return defaultPreferences;
  }
}

/**
 * Maps which preferences apply to each content type and how they should be applied.
 * This matrix approach allows precise control over how preferences affect different content types.
 */
const contentTypePreferenceMatrix = {
  // Summary-specific preference handlers
  summary: {
    // Learning preferences for summaries
    contentComplexity: {
      simplified:
        "Use simple language with minimal technical terms. Focus on core concepts only.",
      balanced:
        "Use clear language suitable for undergraduate level. Include key technical terms with brief explanations.",
      advanced:
        "Use precise terminology and academic language. Assume advanced understanding of the subject area.",
    },
    contentLength: {
      concise:
        "Create a very brief summary focusing only on the most essential points.",
      balanced:
        "Create a moderately detailed summary covering key points and supporting details.",
      detailed:
        "Create a detailed and comprehensive summary covering main points, supporting details, and nuanced relationships between concepts.",
    },
    // Format preferences for summaries
    formatInstructions: (formatPrefs) => {
      const instructions = [];
      if (formatPrefs.prefersBulletPoints) {
        instructions.push("use bullet points for listing key concepts");
      }
      if (formatPrefs.prefersHeadings) {
        instructions.push("organize with clear headings and subheadings");
      }
      if (formatPrefs.prefersHighlighting) {
        instructions.push(
          "highlight key terms or concepts (using **markdown**)"
        );
      }
      return instructions;
    },
  },

  // Explanation-specific preference handlers
  explanation: {
    // Learning preferences for explanations
    contentComplexity: {
      simplified:
        "Use simple, everyday language. Avoid jargon, and when technical terms are necessary, explain them clearly.",
      balanced:
        "Use clear language at an undergraduate level. Introduce technical terms with brief explanations.",
      advanced:
        "Use precise, technical language appropriate for advanced students. Include domain-specific terminology.",
    },
    examplesPreference: {
      few: "Include only the most essential examples to illustrate key points.",
      balanced:
        "Use a moderate number of examples to illustrate concepts and applications.",
      many: "Provide numerous examples to thoroughly illustrate concepts, edge cases, and applications.",
    },
    contentLength: {
      concise: "Keep explanations brief and focused on core concepts.",
      balanced:
        "Provide moderately detailed explanations with some supporting context.",
      detailed:
        "Create comprehensive explanations covering main concepts, edge cases, and broader context.",
    },
    // Format preferences for explanations
    formatInstructions: (formatPrefs) => {
      const instructions = [];
      if (formatPrefs.prefersBulletPoints) {
        instructions.push("use bullet points to break down complex concepts");
      }
      if (formatPrefs.prefersNumberedLists) {
        instructions.push(
          "use numbered lists for sequential processes or steps"
        );
      }
      if (formatPrefs.prefersHeadings) {
        instructions.push("structure with clear headings and subheadings");
      }
      if (formatPrefs.prefersHighlighting) {
        instructions.push(
          "highlight key terms or concepts (using **markdown**)"
        );
      }
      return instructions;
    },
  },

  // Additional content types can be added here (quiz, flashcards, etc.)
};

/**
 * Builds a prompt for the LLM based on the generation type, context, and user preferences.
 *
 * @param {string} generationType - The type of content to generate (e.g., 'summary', 'explanation', 'quiz').
 * @param {object} context - The input context (e.g., document text, topic).
 * @param {string} userId - The user's ID to fetch preferences for.
 * @param {FirebaseFirestore.Firestore} db - Firestore instance for fetching preferences.
 * @returns {Promise<object>} Object containing the prompt and user preferences for tracing.
 */
export async function buildPrompt(generationType, context, userId, db) {
  console.log(
    `Building prompt for type: ${generationType} for user: ${userId}`,
    {
      generationType,
    }
  );

  // Fetch user preferences
  const preferences = await fetchUserPreferences(userId, db);

  // Extract context properties
  const {
    text,
    context: documentContext = "",
    documentLanguage,
    isEntireDocument = false,
  } = context;

  // Initialize base prompt based on generation type
  let basePrompt = "";

  switch (generationType) {
    case "summary":
      basePrompt = getSummaryBasePrompt(
        text,
        documentContext,
        documentLanguage,
        isEntireDocument
      );
      break;
    case "explanation":
      basePrompt = getExplanationBasePrompt(
        text,
        documentContext,
        documentLanguage
      );
      break;

    // Add other generation types here as needed
    default:
      console.log(
        `Unknown generation type: ${generationType}. Using generic prompt.`
      );
      basePrompt = `Process the following text based on user request:\n\n${text}`;
  }

  // Apply content-type specific preferences using the matrix
  const preferenceInstructions = buildTypeSpecificPreferenceInstructions(
    generationType,
    preferences
  );

  // Only add preference instructions if any were generated
  let finalPrompt = basePrompt;
  if (preferenceInstructions.length > 0) {
    finalPrompt = `${basePrompt}\n\nPlease adapt to these user preferences:\n- ${preferenceInstructions.join("\n- ")}`;
  }

  console.log("Generated personalized prompt for type: " + generationType);

  // Return both the prompt and the preferences for tracing
  return {
    prompt: finalPrompt,
    preferences: preferences,
  };
}

/**
 * Builds type-specific preference instructions based on the content type and user preferences.
 * Uses the contentTypePreferenceMatrix to determine which preferences apply and how they're applied.
 */
function buildTypeSpecificPreferenceInstructions(generationType, preferences) {
  const preferenceInstructions = [];
  const matrix = contentTypePreferenceMatrix[generationType];

  // If no matrix entry exists for this generation type, return empty instructions
  if (!matrix) {
    console.log(`No preference matrix found for type: ${generationType}`);
    return preferenceInstructions;
  }

  // Apply learning preferences
  const learningPrefs = preferences?.learningPreferences || {};

  // Apply content complexity if applicable to this generation type
  if (matrix.contentComplexity && learningPrefs.contentComplexity) {
    const complexityInstruction =
      matrix.contentComplexity[learningPrefs.contentComplexity];
    if (complexityInstruction) {
      preferenceInstructions.push(complexityInstruction);
    }
  }

  // Apply examples preference if applicable to this generation type
  if (matrix.examplesPreference && learningPrefs.examplesPreference) {
    const examplesInstruction =
      matrix.examplesPreference[learningPrefs.examplesPreference];
    if (examplesInstruction) {
      preferenceInstructions.push(examplesInstruction);
    }
  }

  // Apply content length if applicable to this generation type
  if (matrix.contentLength && learningPrefs.contentLength) {
    const lengthInstruction = matrix.contentLength[learningPrefs.contentLength];
    if (lengthInstruction) {
      preferenceInstructions.push(lengthInstruction);
    }
  }

  // Apply formatting preferences if applicable to this generation type
  if (matrix.formatInstructions) {
    const formatPrefs = preferences?.contentFormatPreferences || {};
    const formatInstructions = matrix.formatInstructions(formatPrefs);

    if (formatInstructions.length > 0) {
      preferenceInstructions.push(
        `Format the content as follows: ${formatInstructions.join(", ")}.`
      );
    }
  }

  return preferenceInstructions;
}

/**
 * Creates a base prompt for summary generation.
 */
function getSummaryBasePrompt(
  text,
  documentContext,
  documentLanguage,
  isEntireDocument
) {
  const language = documentLanguage === "en" ? "English" : "Italian";

  let prompt = "";

  if (isEntireDocument) {
    prompt = `Create a structured summary of this document in ${language}.
Highlight main themes, key arguments, supporting evidence, and conclusions.
Use markdown formatting to organize key points and enhance readability.
Aim for clarity while preserving critical insights.

<document_to_summarize>
${text}
</document_to_summarize>`;
  } else {
    prompt = `Synthesize the core concepts and significance of this selection in ${language}.
Identify underlying principles, critical relationships between ideas, and contextual relevance.
Structure with markdown to highlight hierarchical relationships between concepts.`;

    const hasContext = documentContext && documentContext.trim().length > 0;
    if (hasContext) {
      prompt += `
<document_context>
${documentContext}
</document_context>

<selection_to_summarize>
${text}
</selection_to_summarize>`;
    } else {
      prompt += `
<selection_to_summarize>
${text}
</selection_to_summarize>`;
    }
  }

  prompt += `

Tailor the summary based on content type:
- For conceptual material: Emphasize theoretical frameworks and principles
- For procedural content: Highlight methodology and key processes
- For argumentative text: Present central claims and supporting evidence
- For mathematical/technical content: Distill core formulas and applications

FORMAT REQUIREMENTS (CRITICAL):
- Start directly with summary content
- Do not include any form of introduction or greeting
- Do not include any form of conclusion or sign-off
- Do not include phrases like "In summary", "To conclude", or "This selection covers"
- Do not include any statement about hoping the summary is helpful
- Present only the summarized content with no meta-commentary`;

  return prompt;
}

/**
 * Creates a base prompt for explanation generation.
 */
function getExplanationBasePrompt(text, documentContext, documentLanguage) {
  const language = documentLanguage === "en" ? "English" : "Italian";
  const isShortText = text.length < 100;
  const textType = isShortText ? "term" : "passage";

  let prompt = `Provide an accessible breakdown of this ${textType} in ${language}. Use simpler vocabulary than the original text, shorter sentences, and clear examples.`;

  const hasContext = documentContext && documentContext.trim().length > 0;
  if (hasContext) {
    prompt += `
<document_context>
${documentContext}
</document_context>

Instructions for explaining with context:
- Provide a brief general explanation of the ${textType} first
- Then explain how it specifically applies or is used in this particular context
- Highlight any differences between the general meaning and the context-specific usage if needed
- Only if the ${textType} has a specialized meaning in this context that differs from common usage, clearly explain this distinction

<content_for_explanation>
${text}
</content_for_explanation>`;
  } else {
    prompt += `
<content_for_explanation>
${text}
</content_for_explanation>`;
  }

  prompt += `

Tailor your response based on content type:
- For terminology: Offer definition, application examples, and related concepts based on the document context
- For mathematical expressions: Break down components and practical significance
- For LaTeX notation: Interpret symbols and underlying principles
- For paragraphs: Restructure key ideas with simpler phrasing
- For code snippets: Describe functionality and implementation logic

FORMAT REQUIREMENTS (CRITICAL):
- DO NOT BEGIN WITH ANY VARIATION OF "Here is...", "Ecco una...", "This is...", or any other introductory phrase.
- DO NOT ACKNOWLEDGE THE REQUEST in any way.
- DO NOT include any form of introduction or greeting
- DO NOT include any statement acknowledging the request
- DO NOT include any form of conclusion or sign-off
- DO NOT include any statement about hoping the explanation is helpful
- Present only the explanation with no meta-commentary
- ONLY INCLUDE THE ACTUAL EXPLANATION CONTENT ITSELF.
- Use markdown formatting and LaTeX where appropriate
- WRITE IN ${documentLanguage === "en" ? "ENGLISH" : "ITALIAN"}`;

  return prompt;
}

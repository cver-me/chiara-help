/**
 * Mindmap utility functions
 */

/**
 * Format a Firestore timestamp into a readable date string
 * @param {Object} timestamp - Firestore timestamp object with seconds property
 * @returns {string} Formatted date string
 */
export const formatDate = (timestamp) => {
  if (!timestamp?.seconds) return "";
  const date = new Date(timestamp.seconds * 1000);

  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().slice(-2);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${day}/${month}/${year}, ${hours}:${minutes}`;
};

/**
 * Ensure valid mindmap syntax by adding required elements if missing
 * @param {string} chart - The mermaid chart content
 * @returns {string} Processed chart content with valid syntax
 */
export const ensureValidMindmapSyntax = (chart) => {
  if (!chart) return "";

  let originalContent = chart.trim();
  let initDirective = "";
  let contentWithoutInit = originalContent;

  // Extract existing init block if present
  const initMatch = originalContent.match(/^%%\{init:[\s\S]*?\}%%/);
  if (initMatch) {
    initDirective = initMatch[0].trim() + "\n"; // Keep existing directive + newline
    contentWithoutInit = originalContent.substring(initMatch[0].length).trim();
  } else {
    // If no directive exists, create the default one
    initDirective = `%%{init: {
        "theme": "default",
        "themeVariables": {
          "primaryColor": "#BB2528",
          "primaryTextColor": "#fff",
          "secondaryColor": "#FFD966",
          "tertiaryColor": "#EE4266"
        },
        "mindmap": {
          "padding": 10,
          "maxNodeWidth": 130
        }
      }}%%\n`;
  }

  // Ensure the content (without the init block) starts with mindmap
  let finalContentBody = contentWithoutInit;
  if (!/^mindmap/i.test(contentWithoutInit)) {
    finalContentBody = "mindmap\n" + contentWithoutInit;
  }

  // Combine: Directive + Mindmap + Rest of Content
  let finalContent = initDirective + finalContentBody;

  // Ensure there's a root node if the body is effectively empty
  const lines = finalContentBody
    .split("\n")
    .filter((line) => line.trim().length > 0);

  // Check if only the 'mindmap' line exists in the body
  if (lines.length <= 1 && /^mindmap/i.test(lines[0]?.trim())) {
    finalContent += "\n  Root[Mind Map]";
  }

  return finalContent.trim();
};

/* global Buffer */

import functions from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import crypto from "crypto"; // Node.js built-in for random IDs
import { Workbook, RootTopic, Topic } from "xmind-generator"; // Import from xmind-generator

// --- Simplified Mermaid Mindmap Parser (Updated) ---

// Calculates the indentation level of a line
const getIndentLevel = (line) => {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
};

// Strips Mermaid directive blocks (e.g., %%{init: ...}%%)
const stripMermaidDirectives = (text) => {
  return text.replace(/%%\{[\s\S]*?\}%%\n?/g, "");
};

// Parses Mermaid text into a nested JSON structure
const parseMermaidMindmap = (mermaidText) => {
  // Strip directives first
  const cleanMermaidText = stripMermaidDirectives(mermaidText.trim());

  // Split into lines without filtering for code fences (already handled in generator)
  const lines = cleanMermaidText.split("\n");

  // Find the first non-empty line, which should be 'mindmap'
  const firstLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (
    firstLineIndex === -1 ||
    !lines[firstLineIndex].trim().startsWith("mindmap")
  ) {
    throw new Error(
      "Invalid Mermaid mindmap format: Must start with 'mindmap' after directives."
    );
  }

  // Find the root node line (first line after 'mindmap' with content)
  const rootLineIndex = lines.findIndex(
    (line, index) => index > firstLineIndex && line.trim().length > 0
  );
  if (rootLineIndex === -1) {
    throw new Error(
      "Invalid Mermaid mindmap format: No root node found after 'mindmap' keyword."
    );
  }

  const rootLine = lines[rootLineIndex];
  const rootNode = {
    id: crypto.randomUUID(),
    text: rootLine
      .trim()
      .replace(/^\s*root\(\((.*)\)\)/, "$1")
      .replace(/<br\/>/g, " "),
    children: [],
  };

  let parentStack = [{ node: rootNode, level: -1 }];

  // Process each line after the root
  for (let i = rootLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trimEnd(); // Keep leading spaces but remove trailing
    if (!line.trim()) continue;

    const level = getIndentLevel(line);
    const text = line
      .trim()
      .replace(/^\[(.*)\]$/, "$1") // Remove square brackets
      .replace(/^\((.*)\)$/, "$1") // Remove parentheses
      .replace(/^"(.*)"$/, "$1") // Remove quotes if present
      .replace(/<br\/>/g, " "); // Replace <br/> tags with spaces for XMind compatibility

    const newNode = {
      id: crypto.randomUUID(),
      text: text,
      children: [],
    };

    // Find the appropriate parent based on indentation level
    while (
      parentStack.length > 1 &&
      level <= parentStack[parentStack.length - 1].level
    ) {
      parentStack.pop();
    }

    // Add the new node to its parent
    parentStack[parentStack.length - 1].node.children.push(newNode);
    parentStack.push({ node: newNode, level: level });
  }

  return rootNode;
};

// --- JSON to XMind Conversion using xmind-generator ---

// Recursively builds XMind Topic structure from our parsed JSON nodes
function buildXmindTopics(parsedNode) {
  if (!parsedNode || !parsedNode.text) {
    return null; // Skip nodes without text
  }

  const topicBuilder = Topic(parsedNode.text);
  // Add other attributes if needed: .note(), .markers(), .labels(), etc.
  // topicBuilder.ref(parsedNode.id); // Optional: if you need refs for relationships/summaries

  if (parsedNode.children && parsedNode.children.length > 0) {
    const childTopics = parsedNode.children
      .map(buildXmindTopics) // Recursively build children
      .filter((child) => child !== null); // Filter out any null results

    if (childTopics.length > 0) {
      topicBuilder.children(childTopics);
    }
  }

  return topicBuilder;
}

// --- Firebase Function Definition ---

export const convertMermaidToXmind = functions.onCall(
  { enforceAppCheck: true, cors: true }, // Ensure authentication
  async (data) => {
    // Extract data from the nested request structure
    const mermaidText = data?.data?.mermaidText;
    const mindMapTitle = data?.data?.title || "Untitled Mindmap";

    // Validate the input
    if (!mermaidText || typeof mermaidText !== "string") {
      const errorMsg =
        "The function must be called with a 'mermaidText' string argument.";
      logger.error(`Invalid input: ${errorMsg}`);
      throw new functions.HttpsError("invalid-argument", errorMsg);
    }

    try {
      // 1. Parse Mermaid to internal JSON structure
      const parsedRootNode = parseMermaidMindmap(mermaidText);

      // 2. Build XMind structure using xmind-generator
      const rootTopicBuilder = RootTopic(parsedRootNode.text);
      // rootTopicBuilder.ref(parsedRootNode.id); // Optional ref

      if (parsedRootNode.children && parsedRootNode.children.length > 0) {
        const childTopics = parsedRootNode.children
          .map(buildXmindTopics)
          .filter((child) => child !== null);
        if (childTopics.length > 0) {
          rootTopicBuilder.children(childTopics);
        }
      }
      // Add relationships or summaries here if needed using rootTopicBuilder methods

      // Create the workbook (can set sheet title)
      const workbook = Workbook(rootTopicBuilder, { sheetTitle: mindMapTitle });

      // 3. Generate the XMind file buffer
      const buffer = await workbook.archive(); // Returns ArrayBuffer
      logger.info("XMind conversion completed successfully");

      // 4. Return Base64 encoded data
      // Convert ArrayBuffer to Node.js Buffer then to Base64
      const nodeBuffer = Buffer.from(buffer);
      return { xmindData: nodeBuffer.toString("base64") };
    } catch (error) {
      logger.error("Error during XMind conversion:", error);
      if (error.message.startsWith("Invalid Mermaid")) {
        throw new functions.HttpsError(
          "invalid-argument",
          `Mermaid parsing failed: ${error.message}`
        );
      }
      throw new functions.HttpsError(
        "internal",
        "Failed to convert mind map to XMind format.",
        error.message
      );
    }
  }
);

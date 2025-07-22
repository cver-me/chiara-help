/**
 * Markdown utility functions for heading extraction, ID generation, etc.
 * Shared between TOC and Viewer components.
 */

// Cache for storing extracted headings to avoid redundant processing
const headingsCache = new Map();
const MAX_HEADINGS_CACHE_SIZE = 20; // Limit cache size

// Cache for storing hierarchical headings
const hierarchyCache = new Map();
const MAX_HIERARCHY_CACHE_SIZE = 20; // Limit hierarchy cache size

/**
 * Generates a consistent ID from heading text for linking
 * Uses the same slug generation approach as rehype-slug for compatibility
 *
 * @param {string|Array|Object} text - The heading text or React children
 * @returns {string} - A URL-safe ID string
 */
export const generateHeadingId = (text) => {
  if (!text) return "";

  // Convert React children (arrays/objects) to string
  let textString = "";

  if (typeof text === "string") {
    textString = text;
  } else if (Array.isArray(text)) {
    // Recursively process array of children
    textString = text
      .map((child) => {
        if (typeof child === "string") return child;
        if (child && child.props && child.props.children) {
          return generateHeadingId(child.props.children);
        }
        return "";
      })
      .join("");
  } else if (text && typeof text === "object") {
    // Handle React element objects
    if (text.props && text.props.children) {
      textString = generateHeadingId(text.props.children);
    }
  }

  // Create GitHub-style slug
  return textString
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars except whitespace and hyphen
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Remove consecutive hyphens
};

/**
 * Extracts headings from markdown content
 * Finds all markdown headings (lines starting with #) and extracts text and level
 *
 * @param {string} markdownContent - Raw markdown text
 * @returns {Array} - Array of heading objects with id, text, and level
 */
export const extractHeadings = (markdownContent) => {
  if (!markdownContent) return [];

  const headings = [];
  const lines = markdownContent.split("\n");
  const idMap = {}; // Track duplicate IDs

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match markdown headings (# Heading)
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      let id = generateHeadingId(text);

      // Handle duplicate IDs in the same way as customRehypeSlug
      if (idMap[id]) {
        idMap[id]++;
        id = `${id}-${idMap[id]}`;
      } else {
        idMap[id] = 1;
      }

      headings.push({
        id,
        text,
        level,
        index: i,
        children: [], // Will be filled when creating hierarchy
      });
    }
  }

  return headings;
};

/**
 * Cached version of extractHeadings for better performance
 * Uses a memoized version to avoid processing the same content multiple times
 *
 * @param {string} markdownContent - Raw markdown text
 * @returns {Array} - Array of heading objects with id, text, and level
 */
export const extractHeadingsWithCache = (markdownContent) => {
  if (!markdownContent) return [];

  // Use content as cache key
  if (headingsCache.has(markdownContent)) {
    return headingsCache.get(markdownContent);
  }

  // Extract headings using the regular function
  const headings = extractHeadings(markdownContent);

  // Add to cache
  headingsCache.set(markdownContent, headings);

  // Keep cache size under control
  if (headingsCache.size > MAX_HEADINGS_CACHE_SIZE) {
    // Delete oldest entry
    const firstKey = headingsCache.keys().next().value;
    headingsCache.delete(firstKey);
  }

  return headings;
};

/**
 * Creates a hierarchical structure from flat headings array
 * Organizes headings into a tree based on their level
 * Uses caching for better performance with large documents
 *
 * @param {Array} headings - Flat array of heading objects
 * @returns {Array} - Hierarchical array of heading objects with nested children
 */
export const createHeadingHierarchy = (headings) => {
  if (!headings || !headings.length) return [];
  
  // Create a cache key based on the first few headings and total count
  // This avoids expensive deep comparison while still being reliable
  const cacheKey = headings.length + ':' + 
    headings.slice(0, Math.min(3, headings.length))
      .map(h => `${h.id}:${h.level}`)
      .join('|');
      
  // Check if we have this hierarchy cached
  if (hierarchyCache.has(cacheKey)) {
    return hierarchyCache.get(cacheKey);
  }

  // Create a shallow copy to avoid modifying the original
  // Avoid expensive JSON.parse(JSON.stringify()) deep clone
  const headingsCopy = headings.map(heading => ({
    ...heading,
    children: []
  }));

  // Sort by document position if not already sorted
  headingsCopy.sort((a, b) => a.index - b.index);

  const hierarchy = [];
  const stack = [];

  headingsCopy.forEach((heading) => {
    // Create a new node for the hierarchy
    const node = {
      ...heading,
      children: [],
    };

    // Find the correct parent for this heading
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // This is a top-level heading
      hierarchy.push(node);
    } else {
      // Add as child to the parent
      stack[stack.length - 1].children.push(node);
    }

    // Push this heading to the stack if it could be a parent
    if (heading.level < 6) {
      stack.push(node);
    }
  });
  
  // Store in cache
  hierarchyCache.set(cacheKey, hierarchy);
  
  // Keep cache size under control
  if (hierarchyCache.size > MAX_HIERARCHY_CACHE_SIZE) {
    // Delete oldest entry (first key)
    const firstKey = hierarchyCache.keys().next().value;
    hierarchyCache.delete(firstKey);
  }

  return hierarchy;
};

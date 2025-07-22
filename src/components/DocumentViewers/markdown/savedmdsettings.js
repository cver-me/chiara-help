// Default values and options
export const DEFAULTS = {
  fontSize: 16,
  lineHeight: 1.75,
  backgroundColors: [
    { name: "White", value: "bg-white text-stone-900" },
    { name: "Light", value: "bg-stone-50 text-stone-900" },
    { name: "Sepia", value: "bg-amber-50 text-stone-900" },
    { name: "Dark", value: "bg-stone-800 text-stone-100" },
  ],
  fontFamilies: [
    { name: "Sans Serif", value: "font-sans" },
    { name: "Serif", value: "font-serif" },
    { name: "Mono", value: "font-mono" },
    { name: "Dyslexic Friendly", value: "font-dyslexic" },
  ],
};

// Input limits and steps
export const LIMITS = {
  fontSize: { min: 8, max: 32, step: 1 },
  lineHeight: { min: 1, max: 4.5, step: 0.1 },
};

// Local storage key for saved settings
const STORAGE_KEY = "chiara_markdown_settings";

// Helper to safely access localStorage (handles cases where localStorage is unavailable)
const safeLocalStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn("Failed to access localStorage:", error);
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn("Failed to write to localStorage:", error);
      return false;
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn("Failed to remove item from localStorage:", error);
      return false;
    }
  },
};

// Save settings to localStorage
export const saveSettings = (settings) => {
  safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

// Clear saved settings and restore defaults
export const clearSavedSettings = () => {
  safeLocalStorage.removeItem(STORAGE_KEY);
  return {
    backgroundColor: DEFAULTS.backgroundColors[0].value,
    fontFamily: DEFAULTS.fontFamilies[0].value,
    fontSize: DEFAULTS.fontSize,
    lineHeight: DEFAULTS.lineHeight,
  };
};

// Get saved settings from localStorage
const getSavedSettings = () => {
  const saved = safeLocalStorage.getItem(STORAGE_KEY);
  if (!saved) return null;

  try {
    const parsedSettings = JSON.parse(saved);
    return parsedSettings;
  } catch (error) {
    console.warn("Failed to parse saved settings:", error);
    return null;
  }
};

// Find a background color object by its value
const findBackgroundColor = (value) => {
  if (!value) return DEFAULTS.backgroundColors[0];

  const found = DEFAULTS.backgroundColors.find(
    (color) => color.value === value
  );
  return found || DEFAULTS.backgroundColors[0];
};

// Find a font family object by its value
const findFontFamily = (value) => {
  if (!value) return DEFAULTS.fontFamilies[0];

  const found = DEFAULTS.fontFamilies.find((font) => font.value === value);
  return found || DEFAULTS.fontFamilies[0];
};

// Get default viewer settings with localStorage support
export const getDefaultViewerSettings = () => {
  const savedSettings = getSavedSettings();

  if (!savedSettings) {
    return {
      backgroundColor: DEFAULTS.backgroundColors[0].value,
      fontFamily: DEFAULTS.fontFamilies[0].value,
      fontSize: DEFAULTS.fontSize,
      lineHeight: DEFAULTS.lineHeight,
    };
  }

  return {
    backgroundColor:
      savedSettings.backgroundColor || DEFAULTS.backgroundColors[0].value,
    fontFamily: savedSettings.fontFamily || DEFAULTS.fontFamilies[0].value,
    fontSize: savedSettings.fontSize || DEFAULTS.fontSize,
    lineHeight: savedSettings.lineHeight || DEFAULTS.lineHeight,
  };
};

// Get default panel settings with localStorage support
export const getDefaultPanelSettings = () => {
  const savedSettings = getSavedSettings();

  if (!savedSettings) {
    return {
      backgroundColor: DEFAULTS.backgroundColors[0],
      fontFamily: DEFAULTS.fontFamilies[0],
      fontSize: DEFAULTS.fontSize,
      lineHeight: DEFAULTS.lineHeight,
    };
  }

  return {
    backgroundColor: findBackgroundColor(savedSettings.backgroundColor),
    fontFamily: findFontFamily(savedSettings.fontFamily),
    fontSize: savedSettings.fontSize || DEFAULTS.fontSize,
    lineHeight: savedSettings.lineHeight || DEFAULTS.lineHeight,
  };
};

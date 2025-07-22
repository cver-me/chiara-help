import { useState, useEffect, useRef, useCallback } from "react";
import PropTypes from "prop-types";
import {
  Paintbrush,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DEFAULTS,
  LIMITS,
  getDefaultPanelSettings,
  saveSettings,
  clearSavedSettings,
} from "./savedmdsettings";

// Helper function to check if viewer settings are equal
const areViewerSettingsEqual = (settings1, settings2) => {
  if (!settings1 || !settings2) return false;

  return (
    settings1.backgroundColor === settings2.backgroundColor &&
    settings1.fontFamily === settings2.fontFamily &&
    settings1.fontSize === settings2.fontSize &&
    settings1.lineHeight === settings2.lineHeight
  );
};

/**
 * MarkdownSettings component that provides UI controls for changing
 * markdown display preferences like background color and font family
 */
const MarkdownSettings = ({ onSettingsChange, inMobileSheet = false }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const [settings, setSettings] = useState(() => {
    return getDefaultPanelSettings();
  });

  // Store the last emitted settings to prevent duplicate updates
  const lastEmittedSettingsRef = useRef(null);

  // Check if current settings are different from defaults
  const hasCustomSettings = () => {
    return (
      settings.fontSize !== DEFAULTS.fontSize ||
      settings.lineHeight !== DEFAULTS.lineHeight ||
      settings.backgroundColor.name !== DEFAULTS.backgroundColors[0].name ||
      settings.fontFamily.name !== DEFAULTS.fontFamilies[0].name
    );
  };

  // Debounce timer reference
  const debounceTimerRef = useRef(null);

  // Convert panel settings to viewer settings format
  const convertToViewerSettings = useCallback(() => {
    return {
      backgroundColor: settings.backgroundColor.value,
      fontFamily: settings.fontFamily.value,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
    };
  }, [settings]);

  // Notify parent component of settings changes
  useEffect(() => {
    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Set a new timer to notify parent after 300ms of inactivity
    debounceTimerRef.current = setTimeout(() => {
      if (onSettingsChange) {
        const viewerSettingsFormat = convertToViewerSettings();

        // Only emit if settings have actually changed
        if (
          !areViewerSettingsEqual(
            viewerSettingsFormat,
            lastEmittedSettingsRef.current
          )
        ) {
          // Save settings to localStorage
          saveSettings(viewerSettingsFormat);

          // Update last emitted settings reference
          lastEmittedSettingsRef.current = viewerSettingsFormat;

          // Notify parent component
          onSettingsChange(viewerSettingsFormat);
        }
      }
    }, 300);

    // Cleanup function to clear timer when component unmounts
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [settings, onSettingsChange, convertToViewerSettings]);

  // Generic handler for updating settings
  const handleSettingChange = (key, value, validator) => {
    const validatedValue = validator ? validator(value) : value;
    setSettings((prev) => ({
      ...prev,
      [key]: validatedValue,
    }));
  };

  // Reset all settings to defaults
  const handleResetAllSettings = () => {
    const defaultSettings = {
      backgroundColor: DEFAULTS.backgroundColors[0],
      fontFamily: DEFAULTS.fontFamilies[0],
      fontSize: DEFAULTS.fontSize,
      lineHeight: DEFAULTS.lineHeight,
    };

    // Clear saved settings from localStorage
    clearSavedSettings();

    // Update local state
    setSettings(defaultSettings);

    // Convert to viewer settings format
    const viewerSettingsFormat = {
      backgroundColor: defaultSettings.backgroundColor.value,
      fontFamily: defaultSettings.fontFamily.value,
      fontSize: defaultSettings.fontSize,
      lineHeight: defaultSettings.lineHeight,
    };

    // Update last emitted settings reference
    lastEmittedSettingsRef.current = viewerSettingsFormat;

    // Immediately notify parent component about the reset
    if (onSettingsChange) {
      onSettingsChange(viewerSettingsFormat);
    }
  };

  // Validators for numeric inputs
  const validateFontSize = (size) =>
    Math.min(Math.max(LIMITS.fontSize.min, size), LIMITS.fontSize.max);

  const validateLineHeight = (height) =>
    Math.min(Math.max(LIMITS.lineHeight.min, height), LIMITS.lineHeight.max);

  // Toggle expanded state
  const toggleExpanded = () => setExpanded((prev) => !prev);

  if (!inMobileSheet) return null;

  const isCustomized = hasCustomSettings();

  return (
    <div className="w-full">
      <button
        onClick={toggleExpanded}
        className="p-2 w-full flex items-center justify-between rounded-lg hover:bg-stone-700 transition-colors"
      >
        <div className="flex items-center">
          <Paintbrush className="w-5 h-5 mr-2" />
          <span className="text-sm font-medium">
            {t("markdownSettings.displaySettings")}
          </span>
          {isCustomized && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-stone-500 rounded-full">
              {t("markdownSettings.custom")}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5" />
        ) : (
          <ChevronDown className="w-5 h-5" />
        )}
      </button>

      {expanded && (
        <div className="p-3 pt-2 mt-1 bg-stone-700 rounded-lg">
          {/* Font Size Controls */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-stone-100">
                {t("markdownSettings.fontSize")}
              </label>
              <button
                onClick={() =>
                  handleSettingChange("fontSize", DEFAULTS.fontSize)
                }
                className="flex items-center px-2 py-0.5 text-xs text-stone-300 hover:text-stone-100 hover:bg-stone-600 rounded transition-colors"
                title={t("markdownSettings.resetFontSize", {
                  value: DEFAULTS.fontSize,
                })}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                {t("markdownSettings.default")}
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <input
                  type="range"
                  min={LIMITS.fontSize.min}
                  max={LIMITS.fontSize.max}
                  value={settings.fontSize}
                  onChange={(e) =>
                    handleSettingChange(
                      "fontSize",
                      parseInt(e.target.value),
                      validateFontSize
                    )
                  }
                  className="w-full h-2 bg-stone-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="flex items-center bg-stone-600 rounded-lg">
                <button
                  onClick={() =>
                    handleSettingChange(
                      "fontSize",
                      settings.fontSize - LIMITS.fontSize.step,
                      validateFontSize
                    )
                  }
                  className="px-2 py-1 text-stone-100 hover:bg-stone-500 rounded-l-lg"
                  disabled={settings.fontSize <= LIMITS.fontSize.min}
                >
                  -
                </button>
                <span className="px-3 py-1 text-stone-100 bg-stone-600 text-sm">
                  {settings.fontSize}pt
                </span>
                <button
                  onClick={() =>
                    handleSettingChange(
                      "fontSize",
                      settings.fontSize + LIMITS.fontSize.step,
                      validateFontSize
                    )
                  }
                  className="px-2 py-1 text-stone-100 hover:bg-stone-500 rounded-r-lg"
                  disabled={settings.fontSize >= LIMITS.fontSize.max}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Line Height Controls */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-stone-100">
                {t("markdownSettings.lineSpacing")}
              </label>
              <button
                onClick={() =>
                  handleSettingChange("lineHeight", DEFAULTS.lineHeight)
                }
                className="flex items-center px-2 py-0.5 text-xs text-stone-300 hover:text-stone-100 hover:bg-stone-600 rounded transition-colors"
                title={t("markdownSettings.resetLineSpacing", {
                  value: DEFAULTS.lineHeight,
                })}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                {t("markdownSettings.default")}
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <input
                  type="range"
                  min={LIMITS.lineHeight.min}
                  max={LIMITS.lineHeight.max}
                  step="0.05"
                  value={settings.lineHeight}
                  onChange={(e) =>
                    handleSettingChange(
                      "lineHeight",
                      parseFloat(e.target.value),
                      validateLineHeight
                    )
                  }
                  className="w-full h-2 bg-stone-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div className="flex items-center bg-stone-600 rounded-lg">
                <button
                  onClick={() =>
                    handleSettingChange(
                      "lineHeight",
                      settings.lineHeight - LIMITS.lineHeight.step,
                      validateLineHeight
                    )
                  }
                  className="px-2 py-1 text-stone-100 hover:bg-stone-500 rounded-l-lg"
                  disabled={settings.lineHeight <= LIMITS.lineHeight.min}
                >
                  -
                </button>
                <span className="px-3 py-1 text-stone-100 bg-stone-600 text-sm min-w-[4rem] text-center">
                  {settings.lineHeight.toFixed(2)}
                </span>
                <button
                  onClick={() =>
                    handleSettingChange(
                      "lineHeight",
                      settings.lineHeight + LIMITS.lineHeight.step,
                      validateLineHeight
                    )
                  }
                  className="px-2 py-1 text-stone-100 hover:bg-stone-500 rounded-r-lg"
                  disabled={settings.lineHeight >= LIMITS.lineHeight.max}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Background Color Options */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-100 mb-2">
              {t("markdownSettings.background")}
            </label>
            <div className="flex space-x-3">
              {DEFAULTS.backgroundColors.map((color) => (
                <button
                  key={color.name}
                  className={`w-8 h-8 rounded-full border ${
                    color.value.includes("bg-white") ? "border-stone-300" : ""
                  } ${color.value.split(" ")[0]} flex items-center justify-center
                  ${settings.backgroundColor.name === color.name ? "ring-2 ring-stone-400" : ""}
                  `}
                  title={color.name}
                  onClick={() => handleSettingChange("backgroundColor", color)}
                >
                  {settings.backgroundColor.name === color.name && (
                    <Check
                      className={`w-4 h-4 ${
                        color.value.includes("bg-white") ||
                        color.value.includes("bg-stone-50") ||
                        color.value.includes("bg-amber-50")
                          ? "text-stone-800"
                          : "text-white"
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family Options */}
          <div>
            <label className="block text-sm font-medium text-stone-100 mb-2">
              {t("markdownSettings.fontFamily")}
            </label>
            <div className="space-y-1">
              {DEFAULTS.fontFamilies.map((font) => (
                <button
                  key={font.name}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md ${
                    settings.fontFamily.name === font.name
                      ? "bg-stone-700 text-white ring-1 ring-stone-500"
                      : "text-stone-100 hover:bg-stone-600"
                  } ${font.value} flex items-center`}
                  onClick={() => handleSettingChange("fontFamily", font)}
                >
                  {settings.fontFamily.name === font.name && (
                    <Check className="w-4 h-4 mr-2 text-stone-300" />
                  )}
                  {font.name}
                </button>
              ))}
            </div>
          </div>

          {/* Reset All Settings */}
          <div className="mt-4 pt-4 border-t border-stone-600">
            <button
              onClick={handleResetAllSettings}
              className="w-full flex items-center justify-center p-2 text-sm font-medium text-red-300 hover:text-red-200 hover:bg-stone-600 rounded-lg transition-colors"
              title={t("markdownSettings.resetAllSettingsTooltip")}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t("markdownSettings.resetAllSettings")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

MarkdownSettings.propTypes = {
  onSettingsChange: PropTypes.func,
  inMobileSheet: PropTypes.bool,
};

export default MarkdownSettings;

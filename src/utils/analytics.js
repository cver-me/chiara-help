import { logEvent } from "firebase/analytics";
import { analytics } from "./firebase.js";

// Custom events
export const ANALYTICS_EVENTS = {
  PAGE_VIEW: "page_view",
  SIGN_UP_START: "sign_up_start",
  SIGN_UP_COMPLETE: "sign_up_complete",
  LOGIN_START: "login_start",
  CTA_CLICK: "cta_click",
  FEATURE_INTERACTION: "feature_interaction",
  SECTION_VIEW: "section_view",
};

// Analytics utility functions with safety checks
export const logAnalyticsEvent = (eventName, eventParams = {}) => {
  try {
    if (analytics && window.location.hostname !== "localhost") {
      logEvent(analytics, eventName, {
        timestamp: new Date().toISOString(),
        ...eventParams,
      });
    } else if (import.meta.env.DEV) {
      console.log("Analytics Event (DEV):", {
        event: eventName,
        params: { timestamp: new Date().toISOString(), ...eventParams },
      });
    }
  } catch (error) {
    console.error("Analytics Error:", error);
  }
};

// Page view tracking
export const trackPageView = (pageName, pageParams = {}) => {
  logAnalyticsEvent(ANALYTICS_EVENTS.PAGE_VIEW, {
    page_name: pageName,
    ...pageParams,
  });
};

// CTA click tracking
export const trackCTAClick = (ctaName, ctaLocation) => {
  logAnalyticsEvent(ANALYTICS_EVENTS.CTA_CLICK, {
    cta_name: ctaName,
    cta_location: ctaLocation,
  });
};

// Feature interaction tracking
export const trackFeatureInteraction = (featureName, interactionType) => {
  logAnalyticsEvent(ANALYTICS_EVENTS.FEATURE_INTERACTION, {
    feature_name: featureName,
    interaction_type: interactionType,
  });
};

// Section view tracking (using Intersection Observer)
export const createSectionObserver = (sectionName) => {
  return new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          logAnalyticsEvent(ANALYTICS_EVENTS.SECTION_VIEW, {
            section_name: sectionName,
          });
        }
      });
    },
    { threshold: 0.5 } // Trigger when 50% of the section is visible
  );
};

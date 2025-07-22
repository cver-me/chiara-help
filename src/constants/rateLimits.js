// Frontend Rate Limit Configuration
// This file should ideally be kept in sync with functions/utils/rateLimits.js

export const MEMBERSHIP_TIERS = {
  FREE: "free",
  PLUS: "plus",
  PREMIUM: "premium",
};

// Rate limits per service per day for frontend display
export const RATE_LIMITS = {
  documentAssistant: {
    [MEMBERSHIP_TIERS.FREE]: 10,
    [MEMBERSHIP_TIERS.PLUS]: 50,
    [MEMBERSHIP_TIERS.PREMIUM]: 1000, // Synced with backend
  },
  flashcardGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 10,
    [MEMBERSHIP_TIERS.PREMIUM]: 250, // Synced with backend
  },
  chatGenerator: {
    // Added Chat Generator
    [MEMBERSHIP_TIERS.FREE]: 15,
    [MEMBERSHIP_TIERS.PLUS]: 100,
    [MEMBERSHIP_TIERS.PREMIUM]: 2000, // Synced with backend
  },
  mindmapGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 10,
    [MEMBERSHIP_TIERS.PREMIUM]: 250, // Synced with backend
  },
  // Renamed from audioLectureProcessor for frontend clarity
  lectureTranscription: {
    [MEMBERSHIP_TIERS.FREE]: 2,
    [MEMBERSHIP_TIERS.PLUS]: 5,
    [MEMBERSHIP_TIERS.PREMIUM]: 100, // Synced with backend (audioLectureProcessor)
  },
  audioGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 8,
    [MEMBERSHIP_TIERS.PREMIUM]: 200, // Synced with backend
  },
  quizGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 8,
    [MEMBERSHIP_TIERS.PREMIUM]: 200,
  },
};

// Helper function to get the limit for a specific service and tier
export const getFrontendRateLimit = (service, membershipTier) => {
  const tier = membershipTier || MEMBERSHIP_TIERS.FREE; // Default to free
  if (!RATE_LIMITS[service]) {
    console.warn(
      `Frontend rate limit definition missing for service: ${service}`
    );
    return 0; // Or some default/error value
  }
  // Fallback to FREE tier limit if the specific tier limit isn't defined
  return (
    RATE_LIMITS[service][tier] ??
    RATE_LIMITS[service][MEMBERSHIP_TIERS.FREE] ??
    0
  );
};

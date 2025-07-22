/**
 * Rate limit configuration for Firebase Cloud Functions
 *
 * This file centralizes all rate limiting configurations to make it easier to:
 * 1. Maintain consistent rate limiting across all functions
 * 2. Implement different limits based on user membership levels/tiers
 * 3. Ensure data integrity during concurrent requests
 */

// Import FieldValue at the top of your file
import { FieldValue } from "firebase-admin/firestore";

// User membership tiers/levels
export const MEMBERSHIP_TIERS = {
  FREE: "free",
  PLUS: "plus",
  PREMIUM: "premium",
};

// Rate limits per service per day
export const RATE_LIMITS = {
  // Document Assistant rate limits (summary, explanation)
  documentAssistant: {
    [MEMBERSHIP_TIERS.FREE]: 10,
    [MEMBERSHIP_TIERS.PLUS]: 50,
    [MEMBERSHIP_TIERS.PREMIUM]: 1000,
  },

  // Flashcard Generator rate limits
  flashcardGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 10,
    [MEMBERSHIP_TIERS.PREMIUM]: 250,
  },

  // Chat Generator rate limits
  chatGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 15,
    [MEMBERSHIP_TIERS.PLUS]: 100,
    [MEMBERSHIP_TIERS.PREMIUM]: 2000,
  },

  // Mindmap Generator rate limits
  mindmapGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 10,
    [MEMBERSHIP_TIERS.PREMIUM]: 250,
  },

  // Quiz Generator rate limits
  quizGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 8,
    [MEMBERSHIP_TIERS.PREMIUM]: 200,
  },

  // Audio Generator rate limits
  audioGenerator: {
    [MEMBERSHIP_TIERS.FREE]: 3,
    [MEMBERSHIP_TIERS.PLUS]: 8,
    [MEMBERSHIP_TIERS.PREMIUM]: 200,
  },

  // Audio Lecture Processor rate limits (transcription)
  audioLectureProcessor: {
    [MEMBERSHIP_TIERS.FREE]: 2,
    [MEMBERSHIP_TIERS.PLUS]: 5,
    [MEMBERSHIP_TIERS.PREMIUM]: 100,
  },
};

// Maximum number of timestamps to store per service to prevent document growth
const MAX_STORED_TIMESTAMPS = 100;

/**
 * Get the rate limit for a specific service based on user's membership tier
 * @param {string} service - The service identifier (e.g., 'documentAssistant')
 * @param {string} membershipTier - The user's membership tier
 * @returns {number} - The daily rate limit
 * @throws {Error} If the service is unknown
 */
export const getRateLimit = (
  service,
  membershipTier = MEMBERSHIP_TIERS.FREE
) => {
  if (!RATE_LIMITS[service]) {
    throw new Error(`Unknown service: ${service}`);
  }

  // If the specific tier isn't defined, fall back to FREE tier
  return (
    RATE_LIMITS[service][membershipTier] ||
    RATE_LIMITS[service][MEMBERSHIP_TIERS.FREE]
  );
};

/**
 * Helper function to determine a user's membership tier
 * @param {string} userId - The user's ID
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @returns {Promise<string>} - The user's membership tier
 */
export const getUserMembershipTier = async (userId, db) => {
  if (!userId || !db) {
    return MEMBERSHIP_TIERS.FREE; // Default to free tier if missing userId or db
  }

  try {
    // Get user profile document from userProfiles collection
    const userProfileDoc = await db
      .collection("userProfiles")
      .doc(userId)
      .get();

    if (!userProfileDoc.exists) {
      console.log(
        `No user profile found for user ${userId}, defaulting to free tier`
      );
      return MEMBERSHIP_TIERS.FREE;
    }

    const userData = userProfileDoc.data();
    const membership = userData?.membership || MEMBERSHIP_TIERS.FREE;

    // Validate that the membership is one of our defined tiers
    if (Object.values(MEMBERSHIP_TIERS).includes(membership)) {
      return membership;
    } else {
      console.log(
        `Invalid membership tier "${membership}" for user ${userId}, defaulting to free tier`
      );
      return MEMBERSHIP_TIERS.FREE;
    }
  } catch (error) {
    console.error("Error fetching user membership tier:", error);
    return MEMBERSHIP_TIERS.FREE; // Default to free on error
  }
};

/**
 * Validates if a service exists in the rate limits configuration
 * @param {string} service - Service to check
 * @returns {boolean} - Whether the service exists
 */
const isValidService = (service) => {
  return Object.keys(RATE_LIMITS).includes(service);
};

/**
 * Common rate limit check function that can be used by all services
 * Uses Firestore transactions to handle concurrent requests safely
 *
 * @param {string} userId - The user's ID
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} service - The service identifier (e.g., 'documentAssistant')
 * @returns {Promise<Object>} - Result indicating if the request is allowed
 * @throws {Error} If the service is invalid or there's a database error
 */
export const checkRateLimit = async (userId, db, service) => {
  // Input validation
  if (!userId) throw new Error("User ID is required");
  if (!db) throw new Error("Database instance is required");
  if (!service) throw new Error("Service name is required");
  if (!isValidService(service)) throw new Error(`Unknown service: ${service}`);

  try {
    // Get user's membership tier
    const membershipTier = await getUserMembershipTier(userId, db);

    // Get the rate limit for this service and membership tier
    const limitPerDay = getRateLimit(service, membershipTier);

    const usageRef = db.collection("usageStats").doc(userId);

    // Use a transaction to safely handle concurrent requests
    return await db.runTransaction(async (transaction) => {
      const usageDoc = await transaction.get(usageRef);
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // Initialize usage data if document doesn't exist
      let usageData = usageDoc.exists ? usageDoc.data() || {} : {};

      // Initialize service data if it doesn't exist
      if (!usageData[service]) {
        usageData[service] = {
          requestCount: 0,
          lastRequest: 0,
          requests: [],
        };
      }

      // Filter requests from the last day
      const recentRequests = (usageData[service].requests || []).filter(
        (timestamp) => timestamp > oneDayAgo
      );

      // Check if rate limit is exceeded
      if (recentRequests.length >= limitPerDay) {
        return {
          allowed: false,
          currentCount: recentRequests.length,
          limitPerDay,
          membershipTier,
          nextAvailableTimestamp:
            Math.min(...recentRequests) + 24 * 60 * 60 * 1000,
        };
      }

      // Add new timestamp to the list and ensure we're not storing too many
      recentRequests.push(now);
      if (recentRequests.length > MAX_STORED_TIMESTAMPS) {
        // Only keep the most recent timestamps if we exceed the maximum
        recentRequests.sort((a, b) => b - a); // Sort in descending order
        recentRequests.length = MAX_STORED_TIMESTAMPS; // Truncate the array
      }

      // Create update object that preserves other service data
      const updateData = {
        [service]: {
          requestCount: (usageData[service].requestCount || 0) + 1,
          lastRequest: now,
          lastUpdated: FieldValue.serverTimestamp(), // Use server timestamp
          requests: recentRequests,
        },
      };

      // Update document with merge to preserve other fields
      transaction.set(usageRef, updateData, { merge: true });

      return {
        allowed: true,
        currentCount: recentRequests.length,
        limitPerDay,
        membershipTier,
      };
    });
  } catch (error) {
    console.error(
      `Rate limit check failed for user ${userId}, service ${service}:`,
      error
    );
    throw new Error(`Failed to check rate limit: ${error.message}`);
  }
};

/**
 * Utility function to clean up old usage data
 * Can be called periodically to remove old timestamps and maintain document size
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @returns {Promise<number>} - Number of documents cleaned
 */
export const cleanupOldUsageData = async (db) => {
  try {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let batch = db.batch();
    let cleanCount = 0;

    const usageSnapshot = await db.collection("usageStats").get();

    for (const doc of usageSnapshot.docs) {
      const userData = doc.data();
      let needsUpdate = false;
      const updateData = {};

      // For each service, clean up old timestamps
      Object.keys(userData).forEach((service) => {
        if (userData[service]?.requests?.length > 0) {
          const recentRequests = userData[service].requests.filter(
            (timestamp) => timestamp > oneDayAgo
          );

          // Only update if we've actually filtered out some timestamps
          if (recentRequests.length < userData[service].requests.length) {
            updateData[service] = {
              ...userData[service],
              requests: recentRequests,
              lastUpdated: FieldValue.serverTimestamp(),
            };
            needsUpdate = true;
          }
        }
      });

      if (needsUpdate) {
        batch.set(doc.ref, updateData, { merge: true });
        cleanCount++;
      }

      // Firestore batches are limited to 500 operations
      if (cleanCount >= 450) {
        await batch.commit();
        batch = db.batch();
        cleanCount = 0;
      }
    }

    if (cleanCount > 0) {
      await batch.commit();
    }

    return cleanCount;
  } catch (error) {
    console.error("Error cleaning up usage data:", error);
    throw error;
  }
};

import { Gauge } from "lucide-react";
import PropTypes from "prop-types";
import {
  getFrontendRateLimit,
  MEMBERSHIP_TIERS,
} from "../../constants/rateLimits"; // Import constants

// Helper function to format timestamp (basic example)
const formatTimestamp = (timestamp, language) => {
  if (!timestamp) return null;
  // Convert Firestore Timestamp if necessary
  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);
  if (isNaN(date.getTime())) return null; // Invalid date
  // Use numeric month and day format
  return date.toLocaleString(language || undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Helper function to count recent usage
const countRecentUsage = (serviceStats) => {
  if (!serviceStats || !Array.isArray(serviceStats.requests)) {
    return 0;
  }
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  return serviceStats.requests.filter((timestamp) => timestamp > oneDayAgo)
    .length;
};

const UsageSection = ({ userData, usageStats = {}, t, currentLanguage }) => {
  // Calculate usage counts
  const docAssistantUsage = countRecentUsage(usageStats?.documentAssistant);
  const flashcardUsage = countRecentUsage(usageStats?.flashcardGenerator);
  const mindmapUsage = countRecentUsage(usageStats?.mindmapGenerator);
  // Note: 'audioLectureProcessor' in backend corresponds to 'lectureTranscription' display
  const transcriptionUsage = countRecentUsage(
    usageStats?.audioLectureProcessor
  );
  const audioGenUsage = countRecentUsage(usageStats?.audioGenerator);
  const chatUsage = countRecentUsage(usageStats?.chatGenerator); // Calculate chat usage
  const quizUsage = countRecentUsage(usageStats?.quizGenerator); // Calculate quiz usage

  // Get limits using the helper function from constants
  const currentMembership = userData.membership || MEMBERSHIP_TIERS.FREE;
  const limits = {
    documentAssistant: getFrontendRateLimit(
      "documentAssistant",
      currentMembership
    ),
    flashcardGenerator: getFrontendRateLimit(
      "flashcardGenerator",
      currentMembership
    ),
    mindmapGenerator: getFrontendRateLimit(
      "mindmapGenerator",
      currentMembership
    ),
    lectureTranscription: getFrontendRateLimit(
      "lectureTranscription",
      currentMembership
    ),
    audioGenerator: getFrontendRateLimit("audioGenerator", currentMembership),
    chatGenerator: getFrontendRateLimit("chatGenerator", currentMembership), // Get chat limit
    quizGenerator: getFrontendRateLimit("quizGenerator", currentMembership), // Get quiz limit
  };

  // --- Find the most recent update time ---
  let mostRecentUpdateMs = 0;
  const servicesToCheck = [
    "documentAssistant",
    "flashcardGenerator",
    "chatGenerator",
    "mindmapGenerator",
    "audioLectureProcessor", // Backend key for lectureTranscription
    "audioGenerator",
    "quizGenerator",
  ];

  servicesToCheck.forEach((serviceKey) => {
    const serviceData = usageStats[serviceKey];
    if (serviceData?.lastUpdated) {
      let timestampMs = 0;
      if (typeof serviceData.lastUpdated.toDate === "function") {
        timestampMs = serviceData.lastUpdated.toDate().getTime();
      } else if (typeof serviceData.lastUpdated === "number") {
        // Handle epoch ms
        timestampMs = serviceData.lastUpdated;
      }
      if (timestampMs > mostRecentUpdateMs) {
        mostRecentUpdateMs = timestampMs;
      }
    }
  });

  const formattedLastUpdate = formatTimestamp(
    mostRecentUpdateMs,
    currentLanguage
  );
  // --- End find most recent update time ---

  return (
    <section
      id="usage"
      className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden mt-8 scroll-mt-24"
    >
      <div className="px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-stone-500" />
          <h2 className="text-base font-semibold text-stone-900">
            {t("account.usage.title")}
          </h2>
          {formattedLastUpdate && (
            <p className="text-xs text-stone-500 mt-1">
              {t("account.usage.lastUpdated", {
                timestamp: formattedLastUpdate,
              })}
            </p>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
            <div>
              <h3 className="text-sm font-medium text-stone-900 capitalize">
                {t("account.usage.planType", {
                  plan: userData.membership || "free",
                })}
              </h3>
              <p className="mt-1 text-sm text-stone-500">
                {userData.membership === "premium"
                  ? t("account.usage.premiumDescription")
                  : userData.membership === "plus"
                    ? t("account.usage.plusDescription")
                    : t("account.usage.freeDescription")}
              </p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                userData.membership === "premium"
                  ? "bg-indigo-100 text-indigo-800"
                  : userData.membership === "plus"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-stone-100 text-stone-800"
              }`}
            >
              {userData.membership
                ? userData.membership.toUpperCase()
                : t("account.usage.free").toUpperCase()}
            </span>
          </div>

          <div>
            <h4 className="text-sm font-medium text-stone-900 mb-4">
              {t("account.usage.usageLimits")}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <UsageCard
                title={t("account.usage.documentAssistant")}
                description={t(
                  "account.usage.documentAssistantDescription",
                  "Assists with document analysis and understanding."
                )}
                usage={docAssistantUsage}
                limit={limits.documentAssistant}
                t={t}
              />
              <UsageCard
                title={t("account.usage.flashcardGenerator")}
                description={t(
                  "account.usage.flashcardGeneratorDescription",
                  "Generates flashcards from your study materials."
                )}
                usage={flashcardUsage}
                limit={limits.flashcardGenerator}
                t={t}
              />
              <UsageCard
                title={t("account.usage.mindmapGenerator")}
                description={t(
                  "account.usage.mindmapGeneratorDescription",
                  "Creates mind maps to visualize concepts."
                )}
                usage={mindmapUsage}
                limit={limits.mindmapGenerator}
                t={t}
              />
              <UsageCard
                title={t("account.usage.lectureTranscription")}
                description={t(
                  "account.usage.lectureTranscriptionDescription",
                  "Transcribes spoken lectures into text."
                )}
                usage={transcriptionUsage}
                limit={limits.lectureTranscription}
                t={t}
              />
              <UsageCard
                title={t("account.usage.audioGenerator")}
                description={t(
                  "account.usage.audioGeneratorDescription",
                  "Converts text content into spoken audio."
                )}
                usage={audioGenUsage}
                limit={limits.audioGenerator}
                t={t}
              />
              <UsageCard
                title={t("account.usage.chatGenerator")}
                description={t(
                  "account.usage.chatGeneratorDescription",
                  "Engages in educational conversations and answers questions."
                )}
                usage={chatUsage}
                limit={limits.chatGenerator}
                t={t}
              />
              <UsageCard
                title={t("account.usage.quizGenerator")}
                description={t(
                  "account.usage.quizGeneratorDescription",
                  "Generates quizzes to test your knowledge."
                )}
                usage={quizUsage}
                limit={limits.quizGenerator}
                t={t}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200">
            <p className="text-xs text-stone-500 italic">
              {t("account.usage.usageLimitNote")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

// --- New UsageCard Component ---
const UsageCard = ({ title, description, usage, limit, t }) => {
  const percentage = limit > 0 ? Math.min((usage / limit) * 100, 100) : 0; // Calculate percentage, handle limit=0

  return (
    <div className="p-4 bg-stone-50 rounded-lg border border-stone-200 flex flex-col h-full">
      <div>
        <h5 className="text-sm font-medium text-stone-900">{title}</h5>
        <p className="mt-1 text-xs text-stone-600 min-h-[2.5em]">
          {description}
        </p>
      </div>
      <div className="mt-auto pt-2 space-y-1">
        <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-stone-500 h-2 rounded-full"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <p className="text-sm font-medium text-stone-700 text-right">
          {usage} / {limit}
          <span className="text-xs font-normal text-stone-500 ml-1">
            {t("account.usage.perDay")}
          </span>
        </p>
      </div>
    </div>
  );
};

UsageCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  usage: PropTypes.number.isRequired,
  limit: PropTypes.number.isRequired,
  t: PropTypes.func.isRequired,
};
// --- End New UsageCard Component ---

UsageSection.propTypes = {
  userData: PropTypes.object.isRequired,
  usageStats: PropTypes.object, // Usage stats can be initially empty or missing
  t: PropTypes.func.isRequired,
  currentLanguage: PropTypes.string, // Add prop type for language
};

export default UsageSection;

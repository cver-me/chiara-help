import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../utils/firebase";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  User,
  Gauge,
  Sliders,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { getNames, getCode } from "country-list";

import ProfileSection from "../components/Account/ProfileSection";
import UsageSection from "../components/Account/UsageSection";
import LearningPreferencesSection from "../components/Account/LearningPreferencesSection";
import SecuritySection from "../components/Account/SecuritySection";
import DangerZoneSection from "../components/Account/DangerZoneSection";

// Import the custom toast component
import toast from "../components/Toast";

// Create the options array for react-select with Italy prioritized
const allCountries = getNames().map((name) => ({
  value: getCode(name),
  label: name,
}));

// Remove Italy from the main list and add it at the top with a separator
const italyOption = allCountries.find((country) => country.value === "IT");
const otherCountries = allCountries.filter((country) => country.value !== "IT");

const countryOptions = [
  ...(italyOption ? [italyOption] : []),
  ...(italyOption
    ? [{ value: "", label: "──────────", isDisabled: true }]
    : []),
  ...otherCountries,
];

const selectStyles = {
  control: (base, state) => ({
    ...base,
    borderColor: state.isFocused ? "rgb(68 64 60)" : "#e7e5e4",
    boxShadow: state.isFocused ? "0 0 0 1px rgb(68 64 60)" : "none",
    "&:hover": {
      borderColor: "rgb(68 64 60)",
    },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "rgb(68 64 60)"
      : state.isFocused
        ? "rgb(245 245 244)"
        : "white",
    color: state.isSelected ? "white" : "rgb(28 25 23)",
    "&:active": {
      backgroundColor: state.isSelected ? "rgb(68 64 60)" : "rgb(245 245 244)",
    },
  }),
  input: (base) => ({
    ...base,
    color: "rgb(28 25 23)",
  }),
  singleValue: (base) => ({
    ...base,
    color: "rgb(28 25 23)",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

const AccountPage = () => {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;

  // Define select options with translations
  const educationOptions = [
    {
      value: "middleschool",
      label: t("account.options.education.middleSchool"),
    },
    { value: "highschool", label: t("account.options.education.highSchool") },
    { value: "bachelor", label: t("account.options.universityLevel.bachelor") },
    { value: "master", label: t("account.options.universityLevel.master") },
    { value: "phd", label: t("account.options.universityLevel.doctorate") },
  ];

  const roleOptions = [
    { value: "student", label: t("account.options.role.student") },
    { value: "teacher", label: t("account.options.role.teacher") },
  ];

  const ageRangeOptions = [
    { value: "13-17", label: "13-17" },
    { value: "18-24", label: "18-24" },
    { value: "25-34", label: "25-34" },
    { value: "35-44", label: "35-44" },
    { value: "45+", label: "45+" },
  ];

  // Options for learning preferences
  const complexityOptions = [
    {
      value: "simplified",
      label: t("onboarding.step3.questions.complexity.simplified.title"),
    },
    {
      value: "balanced",
      label: t("onboarding.step3.questions.complexity.balanced.title"),
    },
    {
      value: "advanced",
      label: t("onboarding.step3.questions.complexity.advanced.title"),
    },
  ];

  const examplesOptions = [
    {
      value: "few",
      label: t("onboarding.step3.questions.examples.few.title"),
    },
    {
      value: "balanced",
      label: t("onboarding.step3.questions.examples.balanced.title"),
    },
    {
      value: "many",
      label: t("onboarding.step3.questions.examples.many.title"),
    },
  ];

  const contentLengthOptions = [
    {
      value: "concise",
      label: t("onboarding.step3.questions.length.concise.title"),
    },
    {
      value: "balanced",
      label: t("onboarding.step3.questions.length.balanced.title"),
    },
    {
      value: "detailed",
      label: t("onboarding.step3.questions.length.detailed.title"),
    },
  ];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [userData, setUserData] = useState({
    country: "",
    countryCode: "",
    displayName: "",
    educationLevel: "",
    role: "",
    email: "",
    fullName: "",
    ageRange: "",
    membership: "free",
    learningPreferences: {
      contentComplexity: "balanced",
      examplesPreference: "balanced",
      contentLength: "balanced",
    },
    contentFormatPreferences: {
      prefersBulletPoints: false,
      prefersNumberedLists: false,
      prefersHeadings: true,
      prefersHighlighting: false,
    },
  });
  const [dirtyFields, setDirtyFields] = useState({});
  const [initialUserData, setInitialUserData] = useState(null);
  const [usageStats, setUsageStats] = useState({}); // Add state for usage stats

  // Note: Password form state and handlers moved to SecuritySection
  // Note: Validation state moved to SecuritySection

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      // Toast messages will handle feedback
      try {
        const user = auth.currentUser;
        if (!user) {
          // Handle case where user is not logged in
          toast.error(t("account.errors.notLoggedIn"));
          setLoading(false);
          return;
        }

        // Check providers
        const isGoogleLinked = user.providerData.some(
          (provider) => provider.providerId === "google.com"
        );
        const hasPasswordProvider = user.providerData.some(
          (provider) => provider.providerId === "password"
        );
        setHasPassword(hasPasswordProvider);
        setIsGoogleLinked(isGoogleLinked);

        // Fetch user data from 'users' collection
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        let fetchedUserData = {};

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          fetchedUserData = {
            ...data,
            email: user.email || data.email, // Ensure email is present
            displayName: data.displayName || user.displayName || "", // Prioritize db displayName
            fullName: data.fullName || "", // Only from DB
            country: data.country || "",
            countryCode: data.countryCode || "",
            educationLevel: data.educationLevel || "",
            role: data.role || "",
            ageRange: data.ageRange || "",
            learningPreferences: {
              contentComplexity:
                data.learningPreferences?.contentComplexity || "balanced",
              examplesPreference:
                data.learningPreferences?.examplesPreference || "balanced",
              contentLength:
                data.learningPreferences?.contentLength || "balanced",
            },
            contentFormatPreferences: {
              prefersBulletPoints:
                data.contentFormatPreferences?.prefersBulletPoints || false,
              prefersNumberedLists:
                data.contentFormatPreferences?.prefersNumberedLists || false,
              prefersHeadings:
                data.contentFormatPreferences?.prefersHeadings ?? true, // Default true
              prefersHighlighting:
                data.contentFormatPreferences?.prefersHighlighting || false,
            },
          };
        } else {
          // Handle case where user document doesn't exist yet (shouldn't normally happen post-signup)
          fetchedUserData = {
            email: user.email,
            displayName: user.displayName || "",
            fullName: "",
            country: "",
            countryCode: "",
            educationLevel: "",
            role: "",
            ageRange: "",
            learningPreferences: {
              contentComplexity: "balanced",
              examplesPreference: "balanced",
              contentLength: "balanced",
            },
            contentFormatPreferences: {
              prefersBulletPoints: false,
              prefersNumberedLists: false,
              prefersHeadings: true,
              prefersHighlighting: false,
            },
          };
          console.warn("User document not found for UID:", user.uid);
        }

        // Fetch membership from 'userProfiles' collection
        const userProfileDocRef = doc(db, "userProfiles", user.uid);
        const userProfileDocSnap = await getDoc(userProfileDocRef);
        const membership = userProfileDocSnap.exists()
          ? userProfileDocSnap.data().membership || "free"
          : "free";

        // Fetch usage stats
        let fetchedUsageStats = {};
        try {
          const usageStatsRef = doc(db, "usageStats", user.uid);
          const usageStatsSnap = await getDoc(usageStatsRef);
          if (usageStatsSnap.exists()) {
            fetchedUsageStats = usageStatsSnap.data();
          }
        } catch (usageError) {
          console.error("Error fetching usage stats:", usageError);
        }

        const finalUserData = { ...fetchedUserData, membership };

        setUserData(finalUserData);
        setUsageStats(fetchedUsageStats); // Set usage stats state
        setInitialUserData(JSON.parse(JSON.stringify(finalUserData))); // Deep copy
        setDirtyFields({}); // Reset dirty fields after fetching
      } catch (error) {
        console.error("Error fetching user data:", error);
        toast.error(t("account.errors.fetchFailed"));
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchUserData();
      } else {
        // Handle user signed out state if necessary, e.g., redirect to login
        setLoading(false);
        // No user, likely redirecting or showing login, maybe no toast needed here?
        // If a toast IS needed: toast.error(t("account.errors.notLoggedIn"));
      }
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, [t]); // Add t to dependency array

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setDirtyFields((prev) => ({
      ...prev,
      [name]: true,
    }));
  };

  const handleCountryChange = (selectedOption) => {
    setUserData((prev) => ({
      ...prev,
      country: selectedOption.label,
      countryCode: selectedOption.value,
    }));
    setDirtyFields((prev) => ({
      ...prev,
      country: true,
      countryCode: true,
    }));
  };

  const handleEducationChange = (selectedOption) => {
    setUserData((prev) => ({
      ...prev,
      educationLevel: selectedOption.value,
    }));
    setDirtyFields((prev) => ({
      ...prev,
      educationLevel: true,
    }));
  };

  const handleRoleChange = (selectedOption) => {
    setUserData((prev) => ({
      ...prev,
      role: selectedOption.value,
    }));
    setDirtyFields((prev) => ({
      ...prev,
      role: true,
    }));
  };

  const handleAgeRangeChange = (selectedOption) => {
    setUserData((prev) => ({
      ...prev,
      ageRange: selectedOption.value,
    }));
    setDirtyFields((prev) => ({
      ...prev,
      ageRange: true,
    }));
  };

  const handleComplexityChange = (selectedOption) => {
    setUserData((prev) => ({
      ...prev,
      learningPreferences: {
        ...prev.learningPreferences,
        contentComplexity: selectedOption.value,
      },
    }));
    setDirtyFields((prev) => ({
      ...prev,
      learningPreferences: true,
    }));
  };

  const handleExamplesChange = (selectedOption) => {
    setUserData((prev) => ({
      ...prev,
      learningPreferences: {
        ...prev.learningPreferences,
        examplesPreference: selectedOption.value,
      },
    }));
    setDirtyFields((prev) => ({
      ...prev,
      learningPreferences: true,
    }));
  };

  const handleContentLengthChange = (selectedOption) => {
    setUserData((prev) => ({
      ...prev,
      learningPreferences: {
        ...prev.learningPreferences,
        contentLength: selectedOption.value,
      },
    }));
    setDirtyFields((prev) => ({
      ...prev,
      learningPreferences: true,
    }));
  };

  const handleFormatToggle = (preference) => {
    setUserData((prev) => ({
      ...prev,
      contentFormatPreferences: {
        ...prev.contentFormatPreferences,
        [preference]: !prev.contentFormatPreferences[preference],
      },
    }));
    setDirtyFields((prev) => ({
      ...prev,
      contentFormatPreferences: true,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Object.keys(dirtyFields).length === 0) return; // Don't save if nothing changed

    setSaving(true);
    // Toast feedback will occur on success/failure

    try {
      const user = auth.currentUser;
      if (!user) return;

      // Prepare data to save - only include dirty fields
      const dataToSave = {};
      const profileUpdates = {};
      let learningPrefsChanged = false;
      let formatPrefsChanged = false;

      Object.keys(dirtyFields).forEach((field) => {
        if (field === "learningPreferences") {
          dataToSave.learningPreferences = userData.learningPreferences;
          learningPrefsChanged = true;
        } else if (field === "contentFormatPreferences") {
          dataToSave.contentFormatPreferences =
            userData.contentFormatPreferences;
          formatPrefsChanged = true;
        } else if (field === "membership") {
          // Membership is handled separately in userProfiles
        } else {
          // Add other fields directly
          dataToSave[field] = userData[field];
          profileUpdates[field] = userData[field];
        }
      });

      // Only update if there are changes
      if (
        Object.keys(profileUpdates).length > 0 ||
        learningPrefsChanged ||
        formatPrefsChanged
      ) {
        await updateDoc(doc(db, "users", user.uid), dataToSave);
      }

      // Membership is read-only here, updated elsewhere (e.g., via Stripe webhook)
      // We don't update membership based on UI changes in this component.
      /* 
      if (dirtyFields.membership) {
        await updateDoc(doc(db, "userProfiles", user.uid), {
          membership: userData.membership || "free", // Ensure default
          updatedAt: new Date().toISOString(),
        });
      }
      */

      toast.success(t("account.success.changesSaved"));
      setInitialUserData(JSON.parse(JSON.stringify(userData))); // Update initial state after save
      setDirtyFields({}); // Clear dirty fields after successful save
    } catch (error) {
      console.error("Error updating user data:", error);
      toast.error(t("account.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (!initialUserData || Object.keys(dirtyFields).length === 0) return; // Don't discard if nothing changed or no initial data
    setUserData(JSON.parse(JSON.stringify(initialUserData))); // Restore from deep copy
    setDirtyFields({});
    toast.success(t("account.success.changesDiscarded"));
  };

  // --- Moved Handlers to SecuritySection ---
  // handlePasswordChange
  // handleSendPasswordResetEmail
  // getFirebaseErrorMessage (moved inside SecuritySection)
  // renderSecuritySection (entire logic moved)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  // Prepare selected options for ProfileSection selects
  const selectedCountry = userData.countryCode
    ? { value: userData.countryCode, label: userData.country }
    : null;

  const selectedEducation = userData.educationLevel
    ? educationOptions.find(
        (option) => option.value === userData.educationLevel
      )
    : null;

  const selectedRole = userData.role
    ? roleOptions.find((option) => option.value === userData.role)
    : null;

  const selectedAgeRange = userData.ageRange
    ? ageRangeOptions.find((option) => option.value === userData.ageRange)
    : null;

  const hasDirtyFields = Object.keys(dirtyFields).length > 0;

  const sidebarLinks = [
    { id: "profile", label: t("account.sidebar.profile"), Icon: User },
    { id: "usage", label: t("account.sidebar.usage"), Icon: Gauge },
    {
      id: "learning-preferences",
      label: t("account.sidebar.preferences"),
      Icon: Sliders,
    },
    { id: "security", label: t("account.sidebar.security"), Icon: Lock },
    {
      id: "danger-zone",
      label: t("account.sidebar.dangerZone"),
      Icon: AlertTriangle,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-900">
          {t("account.title")}
        </h1>
        <p className="mt-1 text-sm text-stone-500">{t("account.subtitle")}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-2">
        {/* Sidebar Navigation - Sticky on larger screens */}
        <aside className="hidden lg:block lg:w-48 lg:sticky lg:top-16 h-fit">
          <nav className="space-y-1">
            {sidebarLinks.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                // Add active state styling later if needed based on scroll position
                className="group flex items-center px-3 py-2 text-sm font-medium rounded-md text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              >
                <Icon
                  className="mr-3 h-5 w-5 text-stone-400 group-hover:text-stone-500"
                  aria-hidden="true"
                />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 lg:w-auto space-y-8 pb-24">
          {" "}
          {/* Add padding-bottom to avoid overlap with sticky footer */}
          <ProfileSection
            userData={userData}
            handleInputChange={handleInputChange}
            handleCountryChange={handleCountryChange}
            handleEducationChange={handleEducationChange}
            handleRoleChange={handleRoleChange}
            handleAgeRangeChange={handleAgeRangeChange}
            t={t}
            selectStyles={selectStyles}
            countryOptions={countryOptions}
            educationOptions={educationOptions}
            roleOptions={roleOptions}
            ageRangeOptions={ageRangeOptions}
            auth={auth}
            selectedCountry={selectedCountry}
            selectedEducation={selectedEducation}
            selectedRole={selectedRole}
            selectedAgeRange={selectedAgeRange}
          />
          <UsageSection
            userData={userData}
            usageStats={usageStats}
            t={t}
            currentLanguage={currentLanguage}
          />
          <LearningPreferencesSection
            userData={userData}
            handleComplexityChange={handleComplexityChange}
            handleExamplesChange={handleExamplesChange}
            handleContentLengthChange={handleContentLengthChange}
            handleFormatToggle={handleFormatToggle}
            t={t}
            selectStyles={selectStyles}
            complexityOptions={complexityOptions}
            examplesOptions={examplesOptions}
            contentLengthOptions={contentLengthOptions}
          />
          <SecuritySection
            userData={userData}
            t={t}
            hasPassword={hasPassword}
            isGoogleLinked={isGoogleLinked}
          />
          <DangerZoneSection t={t} />
        </main>
      </div>

      {/* Sticky Footer for Save/Discard */}
      {hasDirtyFields && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-md py-4 px-4 sm:px-6 lg:px-8 z-10">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row-reverse gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !hasDirtyFields}
              className={`w-full sm:w-auto px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 transition-colors ${
                saving || !hasDirtyFields
                  ? "bg-stone-300 cursor-not-allowed"
                  : "bg-stone-900 hover:bg-stone-800"
              }`}
            >
              {saving ? (
                <div className="flex items-center justify-center">
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  {t("account.actions.saving")}
                </div>
              ) : (
                t("account.actions.saveChanges")
              )}
            </button>
            <button
              type="button"
              onClick={handleDiscardChanges}
              disabled={saving || !hasDirtyFields}
              className={`w-full sm:w-auto px-4 py-2 text-sm font-medium border rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 transition-colors ${
                saving || !hasDirtyFields
                  ? "border-stone-200 text-stone-400 cursor-not-allowed"
                  : "border-stone-300 text-stone-700 hover:bg-stone-50"
              }`}
            >
              {t("account.actions.discardChanges")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPage;

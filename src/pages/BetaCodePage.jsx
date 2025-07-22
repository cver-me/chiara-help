import { useState, useEffect, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { auth, db, remoteConfig } from "../utils/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { useTranslation } from "react-i18next";

const BetaCodePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // State for the invitation code input field (if user has one)
  const [inviteCode, setInviteCode] = useState("");
  // Toggle between waiting view and form view.
  const [showInviteForm, setShowInviteForm] = useState(false);
  // State to track if beta restriction is actually enabled
  const [isBetaRestrictionActive, setIsBetaRestrictionActive] = useState(true);
  // State to track authentication
  const [isAuthenticated, setIsAuthenticated] = useState(!!currentUser);

  // Constant for valid invitation code.
  // We don't care if users can see this code since it's not critical.
  const validBetaCode = "BETA2024";

  // Check Remote Config on load
  useEffect(() => {
    const checkBetaRestriction = async () => {
      try {
        await fetchAndActivate(remoteConfig);
        const betaRestrictionConfig = getValue(
          remoteConfig,
          "betaRestrictionEnabled"
        );
        const isRestrictionActive = betaRestrictionConfig.asBoolean();
        setIsBetaRestrictionActive(isRestrictionActive);

        // If beta is no longer restricted, redirect to start page
        if (!isRestrictionActive) {
          navigate("/start");
        }
      } catch (err) {
        console.error("Error checking beta restriction status:", err);
      }
    };

    checkBetaRestriction();
  }, [navigate]);

  // Function to check whether the user has been granted beta access.
  const checkBetaAccess = useCallback(async () => {
    if (!currentUser) return;

    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists() && userDocSnap.data().betaAccessGranted) {
        // If beta access is granted, navigate to onboarding.
        navigate("/onboarding");
      }
    } catch (err) {
      console.error("Error checking beta access:", err);
      setError(t("betaCode.errors.checkingAccess"));
    }
  }, [navigate, currentUser, t]);

  // Check beta access on mount and set up polling every 15 seconds.
  useEffect(() => {
    if (!currentUser) return;

    checkBetaAccess(); // Initial check on mount.
    const intervalId = setInterval(checkBetaAccess, 15000); // Poll every 15 seconds.
    return () => clearInterval(intervalId);
  }, [checkBetaAccess, currentUser]);

  // Check authentication status and redirect if not authenticated
  useEffect(() => {
    setIsAuthenticated(!!currentUser);
  }, [currentUser]);

  // Handler when user submits an invitation code.
  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError("");
    // Validate the entered code.
    if (inviteCode.trim() !== validBetaCode) {
      setError(t("betaCode.errors.invalidCode"));
      return;
    }
    try {
      setLoading(true);
      // Use setDoc with merge: true to update or create the user document if it doesn't exist.
      const userDocRef = doc(db, "users", currentUser.uid);
      await setDoc(userDocRef, { betaAccessGranted: true }, { merge: true });
      // Once beta access is granted, redirect to onboarding.
      navigate("/onboarding");
    } catch (err) {
      console.error("Error updating beta access:", err);
      setError(t("betaCode.errors.general"));
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
      <div className="max-w-md bg-white rounded-lg p-6 shadow-md text-center">
        <h2 className="text-2xl font-bold mb-4 text-stone-900">
          {t("betaCode.title")}
        </h2>
        {/* Show indication if beta restrictions are disabled globally */}
        {!isBetaRestrictionActive && (
          <div className="mb-4 p-3 bg-green-50 text-green-800 rounded-lg">
            {t("betaCode.restrictionsDisabled")}
          </div>
        )}
        {/* Show waiting message if the user hasn't toggled to enter a code */}
        {!showInviteForm ? (
          <>
            <p className="mb-4 text-stone-600">
              {t("betaCode.waitingMessage1")}
            </p>
            <p className="mb-4 text-stone-600">
              {t("betaCode.waitingMessage2")}
            </p>
            {error && <p className="mb-4 text-red-500">{error}</p>}
            <div className="space-y-4">
              <button
                onClick={checkBetaAccess}
                className="w-full px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                {t("betaCode.refreshStatus")}
              </button>
              <button
                onClick={() => setShowInviteForm(true)}
                className="w-full px-4 py-2 text-stone-900 border border-stone-900 rounded-lg hover:bg-stone-100 transition-colors"
              >
                {t("betaCode.haveInviteCode")}
              </button>
            </div>
          </>
        ) : (
          // Invitation code entry form.
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <p className="mb-4 text-stone-600">
              {t("betaCode.enterCodeInstructions")}
            </p>
            <input
              type="text"
              placeholder={t("betaCode.invitationCodePlaceholder")}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring focus:border-stone-500"
              required
            />
            {error && <p className="mb-4 text-red-500">{error}</p>}
            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                {loading ? t("betaCode.verifying") : t("betaCode.submitCode")}
              </button>
              <button
                type="button"
                onClick={() => setShowInviteForm(false)}
                className="w-full px-4 py-2 text-stone-900 border border-stone-900 rounded-lg hover:bg-stone-100 transition-colors"
              >
                {t("betaCode.backToWaiting")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BetaCodePage;

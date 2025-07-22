import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { doc, getDoc } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { auth, db, remoteConfig } from "./utils/firebase";

import HomePage from "./pages/HomePage";
import OnboardingFlow from "./pages/onboarding/OnboardingFlow";
import AccountPage from "./pages/AccountPage";
import StudyMaterialPage from "./pages/StudyMaterialPage";
import DocumentPage from "./pages/DocumentPage";
import ChatPage from "./pages/ChatPage";
import SupportPage from "./pages/SupportPage";
import ScrollToTop from "./components/ScrollToTop";
import { CoursesProvider } from "./context/CoursesContext";
import { Toaster } from "react-hot-toast";
import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";
import { AnimatePresence, motion } from "framer-motion";

// Check if current route is DocumentPage
const isDocumentRoute = (location) =>
  location.pathname.startsWith("/document/");

// Function to check onboarding status
const checkOnboardingStatus = async (userId) => {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);
    return userDoc.exists() && userDoc.data().onboardingCompleted;
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return false;
  }
};

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [betaAccess, setBetaAccess] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [initialRedirect, setInitialRedirect] = useState(false);
  const [isLayoutVisible, setIsLayoutVisible] = useState(false);
  const [betaRestrictionEnabled, setBetaRestrictionEnabled] = useState(false);

  // Check if current route is DocumentPage
  const isDocumentPage = isDocumentRoute(location);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);

      if (currentUser) {
        try {
          // Fetch Remote Config to check if beta restriction is enabled
          await fetchAndActivate(remoteConfig);
          const betaRestrictionConfig = getValue(
            remoteConfig,
            "betaRestrictionEnabled"
          );
          const isBetaRestrictionActive = betaRestrictionConfig.asBoolean();
          setBetaRestrictionEnabled(isBetaRestrictionActive);

          // Check beta access in Firestore
          const userDocRef = doc(db, "users", currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          const hasBetaAccess =
            userDocSnap.exists() && userDocSnap.data().betaAccessGranted;
          setBetaAccess(hasBetaAccess);

          // Only enforce beta restrictions if enabled in Remote Config
          if (
            isBetaRestrictionActive &&
            !hasBetaAccess &&
            !location.pathname.startsWith("/beta-code")
          ) {
            navigate("/beta-code");
            return;
          }

          const onboardingStatus = await checkOnboardingStatus(currentUser.uid);
          setHasCompletedOnboarding(onboardingStatus);
          if (onboardingStatus) {
            setIsLayoutVisible(true);
          }
        } catch (error) {
          console.error("Error checking config or beta status:", error);
          // In case of error, default to allowing access
          setBetaAccess(true);
          setBetaRestrictionEnabled(false);
        }
      } else {
        setHasCompletedOnboarding(false);
        setIsLayoutVisible(false);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, [location.pathname, navigate]);

  // Handle initial redirect
  useEffect(() => {
    if (
      !loading &&
      authChecked &&
      user &&
      !hasCompletedOnboarding &&
      !initialRedirect &&
      !location.pathname.startsWith("/onboarding")
    ) {
      setInitialRedirect(true);
    }
  }, [
    loading,
    authChecked,
    user,
    hasCompletedOnboarding,
    initialRedirect,
    location.pathname,
  ]);

  // Handle layout visibility when onboarding completes
  useEffect(() => {
    if (hasCompletedOnboarding) {
      setIsLayoutVisible(true);
    }
  }, [hasCompletedOnboarding]);

  if (loading || !authChecked) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-stone-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // If the user doesn't have beta access, they must be on beta-code, so no need to check onboarding.
  if (!betaAccess && betaRestrictionEnabled) {
    return <Navigate to="/beta-code" replace />;
  }

  // Regular routing checks
  if (!hasCompletedOnboarding && !location.pathname.startsWith("/onboarding")) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <CoursesProvider>
      <div className="min-h-screen bg-stone-50">
        <Toaster />
        <div
          className={`${isLayoutVisible && !isDocumentPage ? "pt-[48px]" : ""} transition-all duration-300
          min-h-screen bg-stone-50 relative`}
        >
          {isLayoutVisible && !isDocumentPage && (
            <>
              <Header />
              <Sidebar
                isExpanded={isSidebarExpanded}
                setIsExpanded={setIsSidebarExpanded}
              />
            </>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`${isLayoutVisible && !isDocumentPage && isSidebarExpanded ? "lg:pl-52" : isLayoutVisible && !isDocumentPage ? "lg:pl-14" : ""}`}
            >
              <Routes location={location}>
                <Route path="/start" element={<HomePage />} />
                <Route path="/study-material" element={<StudyMaterialPage />} />
                <Route
                  path="/study-material/:courseId"
                  element={<StudyMaterialPage />}
                />
                <Route
                  path="/chat"
                  element={<ChatPage isSidebarExpanded={isSidebarExpanded} />}
                />

                <Route path="/account" element={<AccountPage />} />
                <Route path="/support" element={<SupportPage />} />

                <Route
                  path="/onboarding"
                  element={
                    <OnboardingFlow
                      user={user}
                      setHasCompletedOnboarding={setHasCompletedOnboarding}
                    />
                  }
                />
                <Route path="/document/:docId" element={<DocumentPage />} />
                <Route path="*" element={<Navigate to="/start" />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
        <ScrollToTop />
      </div>
    </CoursesProvider>
  );
};

export default App;

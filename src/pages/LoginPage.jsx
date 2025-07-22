// src/LoginPage.jsx
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../utils/firebase";
import { Eye, EyeOff, Mail, Lock, AlertCircle, ArrowRight } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, remoteConfig } from "../utils/firebase";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { useTranslation } from "react-i18next";

const LoginPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate("/start");
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    try {
      setError("");
      setLoading(true);

      // Set up the Google Auth provider.
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      // Await the popup sign-in promise.
      const result = await signInWithPopup(auth, provider);
      const currentUser = result.user;

      // Fetch Remote Config to check if beta restriction is enabled
      await fetchAndActivate(remoteConfig);
      const betaRestrictionConfig = getValue(
        remoteConfig,
        "betaRestrictionEnabled"
      );
      const isBetaRestrictionActive = betaRestrictionConfig.asBoolean();

      // After sign-in, check for beta access in Firestore.
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        // If user data doesn't exist, create the document with betaAccessGranted set to false
        // This maintains compatibility if beta restriction is re-enabled in the future
        await setDoc(userDocRef, { betaAccessGranted: false }, { merge: true });

        // Only redirect to beta code page if beta restriction is active
        if (isBetaRestrictionActive) {
          navigate("/beta-code");
        } else {
          navigate("/start");
        }
      } else if (
        !userDocSnap.data().betaAccessGranted &&
        isBetaRestrictionActive
      ) {
        // If beta access is not granted and restrictions are active, navigate to beta code page
        navigate("/beta-code");
      } else {
        // Otherwise go to the start page
        navigate("/start");
      }
    } catch (error) {
      if (
        error.code === "auth/cancelled-popup-request" ||
        error.code === "auth/popup-closed-by-user"
      ) {
        console.info("Google sign in popup closed or cancelled.");
      } else {
        console.error("Error signing in with Google:", error);
        setError(t("login.errors.googleSignInFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    try {
      setError("");
      const { email, password } = formData;

      // Basic validation
      if (!email.trim()) {
        setError(t("login.validation.emailRequired"));
        return;
      }
      if (!password) {
        setError(t("login.validation.passwordRequired"));
        return;
      }
      if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        setError(t("login.validation.invalidEmail"));
        return;
      }
      if (password.length < 8) {
        setError(t("login.validation.passwordTooShort"));
        return;
      }

      setLoading(true);

      try {
        // Sign in the user directly without reCAPTCHA verification
        await signInWithEmailAndPassword(auth, email, password);

        // Fetch Remote Config to check if beta restriction is enabled
        await fetchAndActivate(remoteConfig);
        const betaRestrictionConfig = getValue(
          remoteConfig,
          "betaRestrictionEnabled"
        );
        const isBetaRestrictionActive = betaRestrictionConfig.asBoolean();

        // Check for beta access
        const userDocRef = doc(db, "users", auth.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          // If user data doesn't exist, create the document with betaAccessGranted set to false
          await setDoc(
            userDocRef,
            { betaAccessGranted: false },
            { merge: true }
          );

          // Only redirect to beta code page if beta restriction is active
          if (isBetaRestrictionActive) {
            navigate("/beta-code");
          } else {
            navigate("/start");
          }
        } else if (
          !userDocSnap.data().betaAccessGranted &&
          isBetaRestrictionActive
        ) {
          // If beta access is not granted and restrictions are active, navigate to beta code page
          navigate("/beta-code");
        } else {
          // Otherwise go to the start page
          navigate("/start");
        }
      } catch (authError) {
        console.error("Error with email authentication", authError);
        // Handle specific Firebase auth errors
        const errorMessage =
          authError.code === "auth/wrong-password"
            ? t("login.errors.wrongPassword")
            : authError.code === "auth/user-not-found"
              ? t("login.errors.userNotFound")
              : authError.code === "auth/invalid-email"
                ? t("login.errors.invalidEmail")
                : authError.code === "auth/invalid-credential"
                  ? t("login.errors.invalidCredential")
                  : authError.code === "auth/too-many-requests"
                    ? t("login.errors.tooManyRequests")
                    : t("login.errors.signInFailed");
        setError(errorMessage);
        setLoading(false);
      }
    } catch (error) {
      console.error("Error initializing authentication", error);
      setError(t("login.errors.generalError"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-6 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-100 to-amber-50 blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="font-display text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stone-900 to-stone-700 relative">
              Chiara
            </span>
          </div>
          <span className="px-2 py-0.5 bg-gradient-to-r from-amber-50 to-stone-50 text-stone-600 text-xs rounded-full font-medium border border-stone-200">
            Beta
          </span>
        </Link>
      </nav>

      <div className="container mx-auto px-4 pt-16">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-stone-900 mb-4">
              {t("login.welcomeBack")}
            </h2>
            <p className="text-stone-600">{t("login.subtitle")}</p>
          </div>

          {error && (
            <div className="rounded-lg bg-stone-50 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-stone-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-stone-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-stone-300 rounded-lg shadow-sm bg-white hover:bg-stone-50 text-stone-700 font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-75 active:scale-95"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"
                />
              </svg>
              {loading ? t("login.pleaseWait") : t("login.continueWithGoogle")}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-stone-100 text-stone-500">
                  {t("login.orSignInWithEmail")}
                </span>
              </div>
            </div>

            {/* Email/Password Sign In */}
            <form onSubmit={handleEmailSignIn} className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-stone-700 mb-1"
                >
                  {t("login.emailAddress")}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-stone-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none block w-full pl-10 px-3 py-2 border border-stone-300 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                    placeholder={t("login.emailPlaceholder")}
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-stone-700 mb-1"
                >
                  {t("login.password")}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-stone-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="appearance-none block w-full pl-10 px-3 py-2 border border-stone-300 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                    placeholder={t("login.passwordPlaceholder")}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-stone-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-stone-400" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-stone-900 text-white rounded-lg hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-75 active:scale-95"
              >
                {loading ? t("login.signingIn") : t("login.signIn")}{" "}
                {!loading && <ArrowRight size={18} />}
              </button>

              <div className="text-xs text-stone-400 text-center mt-4">
                {t("login.termsAgreement")}{" "}
                <a
                  href="/legal/tos.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className=" hover:text-stone-500 hover:underline"
                >
                  {t("login.termsOfService")}
                </a>{" "}
                {t("login.and")}{" "}
                <a
                  href="/legal/pp.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-stone-500 hover:underline"
                >
                  {t("login.privacyPolicy")}
                </a>
                .
              </div>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-stone-600">
                {t("login.noAccount")}{" "}
                <button
                  onClick={handleGoogleSignIn}
                  className="font-medium text-stone-600 hover:text-stone-500"
                >
                  {t("login.signUpWithGoogle")}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

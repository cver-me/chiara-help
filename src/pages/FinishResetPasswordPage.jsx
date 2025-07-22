import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../utils/firebase";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const FinishResetPasswordPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [actionCode, setActionCode] = useState("");
  const [validationState, setValidationState] = useState({
    hasNumber: false,
    hasSpecial: false,
    hasLength: false,
    passwordsMatch: false,
  });

  useEffect(() => {
    // Get the action code from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const oobCode = urlParams.get("oobCode");

    if (!oobCode) {
      setError(t("resetPassword.errors.invalidLink"));
      setLoading(false);
      return;
    }

    setActionCode(oobCode);

    // Verify the action code
    verifyPasswordResetCode(auth, oobCode)
      .then(() => {
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error verifying reset code:", error);
        setError(t("resetPassword.errors.invalidOrExpiredLink"));
        setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    setValidationState({
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      hasLength: password.length >= 8,
      passwordsMatch: password === confirmPassword && password !== "",
    });
  }, [password, confirmPassword]);

  const getFirebaseErrorMessage = (error) => {
    switch (error.code) {
      case "auth/expired-action-code":
        return t("resetPassword.errors.expiredLink");
      case "auth/invalid-action-code":
        return t("resetPassword.errors.invalidLink");
      case "auth/weak-password":
        return t("resetPassword.errors.weakPassword");
      case "auth/requires-recent-login":
        return t("resetPassword.errors.requiresRecentLogin");
      case "auth/network-request-failed":
        return t("resetPassword.errors.networkError");
      default:
        return t("resetPassword.errors.generic");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await confirmPasswordReset(auth, actionCode, password);
      setSuccess(t("resetPassword.success.passwordSet"));

      // Redirect to login page after a short delay
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (error) {
      console.error("Error setting password:", error);
      setError(getFirebaseErrorMessage(error));
    }
  };

  return (
    <div className="min-h-screen bg-stone-100">
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-stone-600" />
        </div>
      ) : (
        <>
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
                  {t("resetPassword.title")}
                </h2>
                <p className="text-stone-600">{t("resetPassword.subtitle")}</p>
              </div>

              {(error || success) && (
                <div className="rounded-lg bg-stone-50 p-4 mb-6">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      {error ? (
                        <AlertCircle className="h-5 w-5 text-stone-400" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-stone-400" />
                      )}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-stone-800">
                        {error || success}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-stone-700 mb-1"
                  >
                    {t("resetPassword.newPassword")}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-stone-300 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff
                          className="h-5 w-5 text-stone-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Eye
                          className="h-5 w-5 text-stone-400"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2 text-sm space-y-1">
                      <p
                        className={
                          validationState.hasLength
                            ? "text-stone-600"
                            : "text-stone-400"
                        }
                      >
                        • {t("resetPassword.validation.length")}
                      </p>
                      <p
                        className={
                          validationState.hasNumber
                            ? "text-stone-600"
                            : "text-stone-400"
                        }
                      >
                        • {t("resetPassword.validation.number")}
                      </p>
                      <p
                        className={
                          validationState.hasSpecial
                            ? "text-stone-600"
                            : "text-stone-400"
                        }
                      >
                        • {t("resetPassword.validation.special")}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm font-medium text-stone-700 mb-1"
                  >
                    {t("resetPassword.confirmPassword")}
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      name="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      className="appearance-none block w-full px-3 py-2 border border-stone-300 rounded-lg shadow-sm placeholder-stone-400 focus:outline-none focus:ring-stone-500 focus:border-stone-500 sm:text-sm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff
                          className="h-5 w-5 text-stone-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Eye
                          className="h-5 w-5 text-stone-400"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </div>
                  {confirmPassword && (
                    <div className="mt-2 text-sm space-y-1">
                      <p
                        className={
                          validationState.passwordsMatch
                            ? "text-stone-600"
                            : "text-stone-400"
                        }
                      >
                        • {t("resetPassword.validation.passwordsMatch")}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-transparent rounded-lg shadow-sm bg-stone-900 hover:bg-stone-800 text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-75 active:scale-95"
                  disabled={
                    !validationState.hasLength ||
                    !validationState.hasNumber ||
                    !validationState.hasSpecial ||
                    !validationState.passwordsMatch
                  }
                >
                  {t("resetPassword.setNewPassword")}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FinishResetPasswordPage;

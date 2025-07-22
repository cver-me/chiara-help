import { useState, useEffect } from "react";
import { Lock, Key, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import {
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import PropTypes from "prop-types";
import { auth } from "../../utils/firebase"; // Adjust path as needed
import toast from "../Toast"; // Import toast

const SecuritySection = ({ userData, t, hasPassword, isGoogleLinked }) => {
  const [saving, setSaving] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isSettingUpPassword, setIsSettingUpPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [validationState, setValidationState] = useState({
    hasNumber: false,
    hasSpecial: false,
    hasLength: false,
    passwordsMatch: false,
  });

  useEffect(() => {
    setValidationState({
      hasNumber: /\d/.test(passwordForm.newPassword),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword),
      hasLength: passwordForm.newPassword.length >= 8,
      passwordsMatch:
        passwordForm.newPassword === passwordForm.confirmPassword &&
        passwordForm.newPassword !== "",
    });
  }, [passwordForm.newPassword, passwordForm.confirmPassword]);

  const getFirebaseErrorMessage = (error) => {
    switch (error.code) {
      case "auth/requires-recent-login":
        return t("account.security.errors.requiresRecentLogin");
      case "auth/weak-password":
        return t("account.security.errors.weakPassword");
      case "auth/wrong-password":
        return t("account.security.errors.wrongPassword");
      case "auth/too-many-requests":
        return t("account.security.errors.tooManyRequests");
      case "auth/network-request-failed":
        return t("account.security.errors.networkRequestFailed");
      default:
        return t("account.security.errors.generic");
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setSaving(true);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t("account.errors.passwordsDontMatch"));
      setSaving(false);
      return;
    }

    const allValidationsMet =
      validationState.hasLength &&
      validationState.hasNumber &&
      validationState.hasSpecial;

    if (!allValidationsMet) {
      toast.error(t("account.errors.passwordRequirementsNotMet"));
      setSaving(false);
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) return;

      // Reauthenticate user with current password
      const credential = EmailAuthProvider.credential(
        user.email,
        passwordForm.currentPassword
      );
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, passwordForm.newPassword);

      toast.success(t("account.success.passwordUpdated"));
      setShowPasswordForm(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      console.error("Error changing password:", error);
      toast.error(getFirebaseErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordResetEmail = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const actionCodeSettings = {
        url: window.location.origin + "/login?mode=resetPassword", // Changed URL slightly for clarity
        handleCodeInApp: true,
      };

      await sendPasswordResetEmail(auth, userData.email, actionCodeSettings);
      toast.success(t("account.success.passwordResetSent"));
      setIsSettingUpPassword(false);
    } catch (error) {
      console.error("Error sending password reset email:", error);

      if (error.code === "auth/operation-not-allowed") {
        toast.error(t("account.security.errors.operationNotAllowed"));
      } else if (error.code === "auth/invalid-email") {
        toast.error(t("account.security.errors.invalidEmail"));
      } else if (error.code === "auth/user-not-found") {
        toast.error(t("account.security.errors.userNotFound"));
      } else {
        toast.error(t("account.security.errors.failedToSendEmail"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="security"
      className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden mt-8"
    >
      <div className="px-6 py-4 border-b border-stone-200 bg-stone-50">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-stone-500" />
          <h2 className="text-base font-semibold text-stone-900">
            {t("account.security.title")}
          </h2>
        </div>
      </div>

      <div className="p-6">
        <div>
          {/* Account Providers */}
          <div className="pb-6">
            <h4 className="text-sm font-medium text-stone-900 mb-4">
              {t("account.security.connectedAccounts")}
            </h4>
            <div className="space-y-4">
              {/* Google Account */}
              <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-full ${
                      isGoogleLinked ? "bg-stone-100" : "bg-stone-100"
                    }`}
                  >
                    {/* Simplified Google Icon SVG */}
                    <svg
                      className={`w-5 h-5 ${
                        isGoogleLinked ? "text-stone-700" : "text-stone-400"
                      }`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-stone-900">
                      {t("account.security.googleAccount")}
                    </div>
                    <div className="text-sm text-stone-500">
                      {isGoogleLinked ? (
                        <>
                          {t("account.security.connectedAs", {
                            email: userData.email,
                          })}
                        </>
                      ) : (
                        t("account.security.notConnected")
                      )}
                    </div>
                  </div>
                </div>
                {isGoogleLinked && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-700">
                    {t("account.security.connected")}
                  </span>
                )}
              </div>

              {/* Email/Password */}
              <div className="flex items-center justify-between p-4 bg-stone-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-full ${
                      hasPassword ? "bg-stone-100" : "bg-stone-100"
                    }`}
                  >
                    <Key
                      className={`w-5 h-5 ${
                        hasPassword ? "text-stone-700" : "text-stone-400"
                      }`}
                    />
                  </div>
                  <div>
                    <div className="font-medium text-stone-900">
                      {t("account.security.passwordAuth")}
                    </div>
                    <div className="text-sm text-stone-500">
                      {!hasPassword &&
                        !isSettingUpPassword &&
                        t("account.security.passwordSetupInfo")}
                      {hasPassword && t("account.security.passwordSecured")}
                      {!hasPassword && isSettingUpPassword && (
                        <span className="italic">
                          {t("account.security.passwordResetMessageInfo")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Set/Change Password Button */}
                {hasPassword ? (
                  <button
                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 hover:text-stone-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {showPasswordForm
                      ? t("account.security.cancelChangePassword")
                      : t("account.security.changePassword")}
                  </button>
                ) : (
                  !isSettingUpPassword && (
                    <button
                      onClick={() => setIsSettingUpPassword(true)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 hover:text-stone-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {t("account.security.setupPassword")}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Conditional: Password Setup Confirmation UI (inline) */}
            {!hasPassword && isSettingUpPassword && (
              <div className="mt-3 pt-3 border-t border-stone-200 space-y-3">
                <p className="text-sm text-stone-600">
                  {t("account.security.passwordResetMessage", {
                    email: userData.email,
                  })}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleSendPasswordResetEmail}
                    disabled={saving}
                    className="flex-1 inline-flex justify-center items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-stone-900 rounded-md hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("account.security.sendingEmail")}
                      </>
                    ) : (
                      t("account.security.confirmSendLink")
                    )}
                  </button>
                  <button
                    onClick={() => setIsSettingUpPassword(false)}
                    disabled={saving}
                    className="flex-1 inline-flex justify-center items-center px-3 py-1.5 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-md hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-500 disabled:text-stone-400 disabled:border-stone-200 disabled:cursor-not-allowed transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}

            {/* Conditional: Change Password Form (inline) */}
            {hasPassword && showPasswordForm && (
              <div className="mt-4 pt-4 border-t border-stone-200">
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  {/* Current Password */}
                  <div>
                    <label
                      htmlFor="current-password"
                      className="block text-sm font-medium text-stone-700"
                    >
                      {t("account.security.currentPassword")}
                    </label>
                    <div className="mt-1 relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        name="current-password"
                        id="current-password"
                        required
                        autoComplete="current-password"
                        className="appearance-none block w-full px-3 py-2 border border-stone-300 rounded-md shadow-sm placeholder-stone-400 focus:outline-none focus:ring-stone-500 focus:border-stone-500 text-stone-900 text-sm transition-colors"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            currentPassword: e.target.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        onClick={() =>
                          setShowCurrentPassword(!showCurrentPassword)
                        }
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-5 w-5 text-stone-400" />
                        ) : (
                          <Eye className="h-5 w-5 text-stone-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-sm font-medium text-stone-700"
                    >
                      {t("account.security.newPassword")}
                    </label>
                    <div className="mt-1 relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        name="new-password"
                        id="new-password"
                        required
                        autoComplete="new-password"
                        className={`appearance-none block w-full px-3 py-2 border ${
                          passwordForm.newPassword
                            ? validationState.hasLength &&
                              validationState.hasNumber &&
                              validationState.hasSpecial
                              ? "border-green-500 focus:ring-green-500 focus:border-green-500"
                              : "border-red-300 focus:ring-red-500 focus:border-red-500"
                            : "border-stone-300 focus:ring-stone-500 focus:border-stone-500"
                        } rounded-md shadow-sm placeholder-stone-400 focus:outline-none text-stone-900 text-sm transition-colors`}
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            newPassword: e.target.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-5 w-5 text-stone-400" />
                        ) : (
                          <Eye className="h-5 w-5 text-stone-400" />
                        )}
                      </button>
                    </div>
                    {passwordForm.newPassword && (
                      <div className="mt-2 text-xs space-y-1">
                        <p
                          className={
                            validationState.hasLength
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          • {t("account.security.validation.length")}
                        </p>
                        <p
                          className={
                            validationState.hasNumber
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          • {t("account.security.validation.number")}
                        </p>
                        <p
                          className={
                            validationState.hasSpecial
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          • {t("account.security.validation.special")}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="block text-sm font-medium text-stone-700"
                    >
                      {t("account.security.confirmPassword")}
                    </label>
                    <div className="mt-1 relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirm-password"
                        id="confirm-password"
                        required
                        autoComplete="new-password"
                        className={`appearance-none block w-full px-3 py-2 border ${
                          passwordForm.confirmPassword
                            ? validationState.passwordsMatch
                              ? "border-green-500 focus:ring-green-500 focus:border-green-500"
                              : "border-red-300 focus:ring-red-500 focus:border-red-500"
                            : "border-stone-300 focus:ring-stone-500 focus:border-stone-500"
                        } rounded-md shadow-sm placeholder-stone-400 focus:outline-none text-stone-900 text-sm transition-colors`}
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({
                            ...passwordForm,
                            confirmPassword: e.target.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-5 w-5 text-stone-400" />
                        ) : (
                          <Eye className="h-5 w-5 text-stone-400" />
                        )}
                      </button>
                    </div>
                    {passwordForm.confirmPassword && (
                      <p
                        className={`mt-2 text-xs ${
                          validationState.passwordsMatch
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {validationState.passwordsMatch
                          ? t("account.security.validation.passwordsMatch")
                          : t("account.security.validation.passwordsDontMatch")}
                      </p>
                    )}
                  </div>

                  {/* Update Password Button */}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        !(
                          validationState.hasLength &&
                          validationState.hasNumber &&
                          validationState.hasSpecial &&
                          validationState.passwordsMatch
                        )
                      }
                      className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-stone-900 text-white font-medium rounded-lg hover:bg-black transition-colors disabled:opacity-40 disabled:bg-stone-300 disabled:hover:bg-stone-300 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                          {t("account.security.updatingPassword")}
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4 inline mr-2" />
                          {t("account.security.updatePassword")}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Help text for account security */}
          <div className="mt-4 p-4 bg-stone-50 rounded-lg">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-stone-400" />
              </div>
              <div className="text-sm text-stone-700">
                <p className="font-medium mb-1">
                  {t("account.security.securityInfo")}
                </p>
                <p>
                  {isGoogleLinked && !hasPassword && (
                    <>{t("account.security.googleOnlyMessage")}</>
                  )}
                  {!isGoogleLinked && hasPassword && (
                    <>{t("account.security.passwordOnlyMessage")}</>
                  )}
                  {isGoogleLinked && hasPassword && (
                    <>{t("account.security.bothMethodsMessage")}</>
                  )}
                  {!isGoogleLinked && !hasPassword && (
                    <>{t("account.security.noMethodMessage")}</>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

SecuritySection.propTypes = {
  userData: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  hasPassword: PropTypes.bool.isRequired,
  isGoogleLinked: PropTypes.bool.isRequired,
};

export default SecuritySection;

import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { doc, getDoc, setDoc } from "firebase/firestore";
import PropTypes from "prop-types";
import { db } from "../../utils/firebase";
import { Step1, Step2, Step3, Step4 } from "./OnboardingSteps";
import ProgressBar from "./ProgressBar";
import { Loader2 } from "lucide-react";

const OnboardingFlow = ({ user, setHasCompletedOnboarding }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [localOnboardingComplete, setLocalOnboardingComplete] = useState(false);
  const [userData, setUserData] = useState(() => {
    const savedData = localStorage.getItem(`onboarding_${user?.uid}`);
    return savedData ? JSON.parse(savedData) : {};
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentStep]);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user) return;

      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists() && userDoc.data().onboardingCompleted) {
          setLocalOnboardingComplete(true);
          setHasCompletedOnboarding(true);
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
      } finally {
        setLoading(false);
      }
    };

    checkOnboardingStatus();
  }, [user, setHasCompletedOnboarding]);

  useEffect(() => {
    if (user?.uid && Object.keys(userData).length > 0) {
      localStorage.setItem(`onboarding_${user.uid}`, JSON.stringify(userData));
    }
  }, [userData, user]);

  const handleStepComplete = (stepData) => {
    const updatedData = { ...userData, ...stepData };
    setUserData(updatedData);
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = (data) => {
    setUserData(data);
    setCurrentStep((prev) => prev - 1);
  };

  const completeOnboarding = async (finalData) => {
    if (!user) return;

    try {
      const userDocRef = doc(db, "users", user.uid);
      const existingUserDoc = await getDoc(userDocRef);
      const existingData = existingUserDoc.exists()
        ? existingUserDoc.data()
        : {};

      const finalDataWithoutMembership = { ...finalData };
      delete finalDataWithoutMembership.membership;

      const updatedUserData = {
        ...finalDataWithoutMembership,
        fullName: user.displayName || finalData.fullName,
        displayName: user.displayName,
        email: user.email,
        learningPreferences: finalData.learningPreferences,
        contentFormatPreferences: finalData.contentFormatPreferences,
        onboardingCompleted: true,
        updatedAt: new Date().toISOString(),
        createdAt: existingData.createdAt || new Date().toISOString(),
      };

      await setDoc(userDocRef, updatedUserData, { merge: true });

      const userProfileRef = doc(db, "userProfiles", user.uid);
      await setDoc(
        userProfileRef,
        {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          membership: "free",
        },
        { merge: true }
      );

      localStorage.removeItem(`onboarding_${user.uid}`);
      setHasCompletedOnboarding(true);
      navigate("/start");
    } catch (error) {
      console.error("Error completing onboarding:", error);
    }
  };

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-stone-600 animate-spin" />
      </div>
    );
  }

  if (localOnboardingComplete) {
    return <Navigate to="/start" replace />;
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1 onNext={handleStepComplete} user={user} data={userData} />
        );
      case 2:
        return (
          <Step2
            onNext={handleStepComplete}
            onBack={handleBack}
            data={userData}
          />
        );
      case 3:
        return (
          <Step3
            onNext={handleStepComplete}
            onBack={handleBack}
            data={userData}
          />
        );
      case 4:
        return (
          <Step4
            onComplete={completeOnboarding}
            onBack={handleBack}
            data={userData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <ProgressBar currentStep={currentStep} totalSteps={4} />
      <div className="flex-1 pt-12">{renderStep()}</div>
    </div>
  );
};

OnboardingFlow.propTypes = {
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired,
    displayName: PropTypes.string,
    email: PropTypes.string.isRequired,
  }),
  setHasCompletedOnboarding: PropTypes.func.isRequired,
};

export default OnboardingFlow;

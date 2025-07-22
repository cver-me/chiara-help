// src/utils/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getAnalytics } from "firebase/analytics";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken,
} from "firebase/app-check";
import { getRemoteConfig } from "firebase/remote-config";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check
if (import.meta.env.DEV) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
}

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(
    import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER_ID
  ),
  isTokenAutoRefreshEnabled: true,
});

// After initializing appCheck
getToken(appCheck, /* forceRefresh */ true)
  .then(() => {})
  .catch((error) => {
    console.error("Error getting App Check token:", error);
  });

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const analytics = getAnalytics(app);

// Initialize Remote Config with appropriate settings
export const remoteConfig = getRemoteConfig(app);
remoteConfig.settings = {
  minimumFetchIntervalMillis: 3600000, // 1 hour in development (consider 12 hours in production)
  fetchTimeoutMillis: 60000, // 1 minute timeout
};

// Set default values for beta restriction
remoteConfig.defaultConfig = {
  betaRestrictionEnabled: false,
};

// Connect to emulators in development
const useEmulator =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true" ||
  window.location.hostname === "localhost";

if (useEmulator) {
  // Auth emulator
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });

  // Firestore emulator
  connectFirestoreEmulator(db, "localhost", 8080);

  // Storage emulator
  connectStorageEmulator(storage, "localhost", 9199);

  // Functions emulator
  connectFunctionsEmulator(functions, "localhost", 5001);

  console.log("Connected to Firebase emulators");
}

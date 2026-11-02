import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// No Firebase service is initialized when configuration is absent. In particular,
// opting into an emulator never silently falls back to a real cloud project.
export const firebaseConfigured = Object.values(config).every((value) => typeof value === "string" && value.trim().length > 0);
const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
if (import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true" && auth && db) {
  if (!config.projectId.startsWith("demo-")) throw new Error("Firebase emulator mode requires a demo- project ID.");
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

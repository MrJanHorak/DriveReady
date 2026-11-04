// Explicitly local and emulator-only. This is not a deployment entry point.
import { createServer } from "node:http";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createLocalSharedGateway } from "./localSharedGateway.mjs";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Firebase emulators are required.");
const app = initializeApp({ projectId: "demo-driveready" });
const isolated = process.env.DRIVEREADY_ISOLATED_DEMO === "true";
const server = createServer(createLocalSharedGateway({ db: getFirestore(app), auth: getAuth(app), origin: isolated ? "http://127.0.0.1:4174" : "http://127.0.0.1:4173" }));
server.listen(isolated ? 4176 : 4175, "127.0.0.1", () => console.log("Local shared-space emulator gateway ready."));

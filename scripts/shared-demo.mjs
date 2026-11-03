// Runs only as a child of the local Firebase emulators. Never deploy or use real data.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createSharedAccessService } from "../server/sharedAccess.mjs";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
  throw new Error("Refusing to seed: start through npm run demo:shared with the local demo emulators.");
}
const app = initializeApp({ projectId: "demo-driveready" });
const adminAuth = getAuth(app);
const service = createSharedAccessService({ db: getFirestore(app), auth: adminAuth });
const password = "fictional-drive-123";
const accounts = {};
try {
  for (const role of ["manager", "supervisor", "learner"]) {
    const email = `${role}@example.test`;
    const user = await adminAuth.createUser({ email, password, emailVerified: true });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (!response.ok) throw new Error("Could not sign in a fictional account.");
    accounts[role] = { uid: user.uid, token: (await response.json()).idToken, email };
  }
  const { spaceId } = await service.createSpace({ idToken: accounts.manager.token, learnerName: "Alex Example" });
  for (const role of ["supervisor", "learner"]) {
    const invitation = await service.createInvitation({ idToken: accounts.manager.token, spaceId, recipientEmail: accounts[role].email, role });
    await service.acceptInvitation({ idToken: accounts[role].token, spaceId, token: invitation.token });
  }
  await service.createDrive({ idToken: accounts.supervisor.token, spaceId, operationId: randomUUID(), date: "2026-10-30", minutes: "60", nightMinutes: "15", notes: "Fictional practice: worked on turns and intersections.", supervisorPresentUid: accounts.supervisor.uid });
} finally {
  await deleteApp(app);
}

const env = { ...process.env, VITE_FIREBASE_API_KEY: "demo-key", VITE_FIREBASE_AUTH_DOMAIN: "demo-driveready.firebaseapp.com", VITE_FIREBASE_PROJECT_ID: "demo-driveready", VITE_FIREBASE_APP_ID: "demo-app", VITE_FIREBASE_USE_EMULATORS: "true", VITE_SHARED_ACCESS_EMULATOR: "true" };
const children = [
  spawn(process.execPath, ["server/startLocalSharedGateway.mjs"], { env, stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { env, stdio: "inherit" }),
];
console.log("\nFictional shared demo: http://127.0.0.1:4173/\nSign in as manager@example.test, supervisor@example.test, or learner@example.test\nPassword for each: fictional-drive-123\nData is temporary. Use fictional data only. Press Ctrl+C to stop.\n");
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => { if (!stopping) { console.error("A demo service stopped unexpectedly."); stop(code || 1); } });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

// Starts the deployable entry point against the local emulators (explicit opt-in)
// and exercises it over HTTP the way the web app does.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const port = 4195, origin = "http://127.0.0.1:4173", base = `http://127.0.0.1:${port}`;
let child, admin;

before(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Run with npm run test:shared (local emulators required).");
  admin = initializeApp({ projectId: "demo-driveready" }, "main-entry-test");
  child = spawn(process.execPath, ["server/main.mjs"], { env: { ...process.env, FIREBASE_PROJECT_ID: "demo-driveready", SHARED_SERVICE_ALLOW_EMULATORS: "true", ALLOWED_ORIGINS: origin, PORT: String(port), HOST: "127.0.0.1", RATE_LIMIT_PER_MINUTE: "5" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Service did not start:\n${output}`);
});
after(async () => { child?.kill(); if (admin) await deleteApp(admin); });

async function signIn(email, password) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  return (await response.json()).idToken;
}

test("the deployable service verifies accounts, writes through the shared service and limits bursts", async () => {
  const email = `main-${randomUUID()}@example.test`, password = "synthetic-password-123";
  const user = await getAuth(admin).createUser({ email, password, emailVerified: true });
  const token = await signIn(email, password);
  const call = (headers = {}) => fetch(`${base}/v1/spaces`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers }, body: JSON.stringify({ learnerName: "Fictional hosted learner" }) });
  const created = await call();
  assert.equal(created.status, 200);
  const { spaceId } = await created.json();
  const space = (await getFirestore(admin).doc(`spaces/${spaceId}`).get()).data();
  assert.equal(space.managerUid, user.uid);
  assert.equal((await call({ Origin: "https://other.example" })).status, 403);
  assert.equal((await call({ Authorization: "Bearer not-a-token" })).status, 403);
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await call()).status);
  assert.ok(statuses.includes(429), `expected a 429 in ${statuses}`);
});

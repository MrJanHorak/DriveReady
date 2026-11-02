// Destructive cleanup is limited to the random test account created by this run.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { initializeApp, deleteApp } from "firebase/app";
import { createUserWithEmailAndPassword, deleteUser, getAuth, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { createCloudRecord, readCloudFamily } from "../src/app/cloudFamily.js";

const env = Object.fromEntries(readFileSync(".env.development.local", "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
const projectId = "driveready-dev-jh-261102";
if (env.VITE_FIREBASE_PROJECT_ID !== projectId || env.VITE_FIREBASE_USE_EMULATORS !== "false") throw new Error("Refusing to run outside the dedicated DriveReady development project.");
const firebaseCli = join(dirname(process.execPath), "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
if (!existsSync(firebaseCli)) throw new Error("Firebase CLI installation not found; no test accounts were created.");
const config = { projectId, apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, appId: env.VITE_FIREBASE_APP_ID };
const apps = ["smoke-owner", "smoke-other", "smoke-guest"].map((name) => initializeApp(config, name));
const clients = apps.map((app) => ({ auth: getAuth(app), db: getFirestore(app) }));
const created = [];
let ownerUid;
let failed = false;
try {
  const suffix = randomBytes(10).toString("hex");
  const password = randomBytes(24).toString("base64url");
  for (const [index, label] of [[0, "owner"], [1, "other"]]) {
    const result = await createUserWithEmailAndPassword(clients[index].auth, `driveready-smoke-${label}-${suffix}@example.com`, password);
    created.push(result.user);
  }
  ownerUid = created[0].uid;
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(ownerUid)) throw new Error("Unexpected test UID; automatic cleanup refused.");
  const learner = { id: "synthetic-learner", name: "Synthetic Test" };
  const drive = { id: "synthetic-drive", learnerId: learner.id, date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "Synthetic smoke test" };
  await createCloudRecord(clients[0].db, ownerUid, "learners", learner);
  await createCloudRecord(clients[0].db, ownerUid, "drives", drive);
  const loaded = await readCloudFamily(clients[0].db, ownerUid);
  assert.equal(loaded.drives[0].minutes, 30);
  for (const client of clients.slice(1)) {
    await assert.rejects(readCloudFamily(client.db, ownerUid), (error) => error.code === "permission-denied");
    await assert.rejects(createCloudRecord(client.db, ownerUid, "learners", { id: "blocked", name: "Synthetic" }), (error) => error.code === "permission-denied");
  }
  await signOut(clients[0].auth);
  await assert.rejects(readCloudFamily(clients[0].db, ownerUid), (error) => error.code === "permission-denied");
  // Sign back in to remove the temporary account after its documents are removed.
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(clients[0].auth, `driveready-smoke-owner-${suffix}@example.com`, password);
  console.log("Live smoke test passed: account creation, private writes and reads, isolation, and sign-out.");
} catch (error) {
  failed = true;
  console.error("Live smoke test failed:", error.message);
} finally {
  if (ownerUid && /^[A-Za-z0-9_-]{20,128}$/.test(ownerUid)) {
    try {
      execFileSync(process.execPath, [firebaseCli, "firestore:delete", `users/${ownerUid}`, "--recursive", "--force", "--project", projectId], { stdio: "pipe" });
      console.log("Temporary Firestore records removed.");
    } catch {
      failed = true;
      console.error(`Could not clean temporary Firestore path users/${ownerUid} in ${projectId}.`);
    }
  }
  for (const user of created) {
    try { await deleteUser(user); } catch { failed = true; console.error(`Could not remove temporary authentication user ${user.uid}.`); }
  }
  await Promise.all(apps.map(deleteApp));
}
if (failed) process.exitCode = 1;

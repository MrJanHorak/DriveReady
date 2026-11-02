import test from "node:test";
import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { createCloudRecord, importCloudFamily, readCloudFamily, replaceCloudRecord } from "./cloudFamily.js";

test("authenticated clients isolate records and detect multi-device conflicts", async () => {
  const apps = ["one", "two", "other"].map((name) => initializeApp({ apiKey: "demo-key", projectId: "demo-driveready", authDomain: "demo-driveready.firebaseapp.com", appId: "demo-app" }, name));
  const clients = apps.map((app) => {
    const auth = getAuth(app), db = getFirestore(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    return { auth, db };
  });
  try {
    const [first, second, other] = clients;
    const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const password = "test-password-123";
    const { user } = await createUserWithEmailAndPassword(first.auth, email, password);
    await signInWithEmailAndPassword(second.auth, email, password);
    await createUserWithEmailAndPassword(other.auth, `other-${email}`, password);
    const learner = { id: "learner", name: "Test learner" };
    const drive = { id: "drive", learnerId: "learner", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" };
    await importCloudFamily(first.db, user.uid, { version: 1, learners: [learner], drives: [drive] });
    const loaded = await readCloudFamily(second.db, user.uid);
    assert.equal(loaded.drives[0].minutes, 30);
    await assert.rejects(readCloudFamily(other.db, user.uid));
    await replaceCloudRecord(first.db, user.uid, "drives", drive, { ...drive, minutes: 45 });
    await assert.rejects(replaceCloudRecord(second.db, user.uid, "drives", loaded.drives[0], { ...drive, minutes: 60 }), /changed on another device/);
    assert.equal((await readCloudFamily(second.db, user.uid)).drives[0].minutes, 45);
    await signOut(first.auth);
    await assert.rejects(createCloudRecord(first.db, user.uid, "learners", { id: "after-logout", name: "No access" }));
  } finally {
    await Promise.all(apps.map(deleteApp));
  }
});

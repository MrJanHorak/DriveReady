import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import assert from "node:assert/strict";
import { createCloudRecord, importCloudFamily, readCloudFamily, replaceCloudRecord } from "./cloudFamily.js";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-driveready", firestore: { rules: await readFile("firestore.rules", "utf8") } });
});

test("cloud records avoid overwrites, detect stale edits, and import safely", async () => {
  const alice = env.authenticatedContext("import-owner").firestore();
  const learner = { id: "a", name: "Alex" };
  const drive = { id: "d", learnerId: "a", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" };
  const local = { version: 1, learners: [learner], drives: [drive] };
  assert.deepEqual(await importCloudFamily(alice, "import-owner", local), { created: 2, existing: 0, conflicts: 0 });
  assert.deepEqual(await importCloudFamily(alice, "import-owner", local), { created: 0, existing: 2, conflicts: 0 });
  const loaded = await readCloudFamily(alice, "import-owner");
  assert.equal(loaded.drives[0].minutes, 30);
  await assert.rejects(createCloudRecord(alice, "import-owner", "learners", learner));
  await replaceCloudRecord(alice, "import-owner", "drives", drive, { ...drive, minutes: 45 });
  await assert.rejects(replaceCloudRecord(alice, "import-owner", "drives", drive, { ...drive, minutes: 60 }));
  assert.deepEqual(await importCloudFamily(alice, "import-owner", local), { created: 0, existing: 1, conflicts: 1 });
  const conflictingFamily = { ...local, learners: [{ id: "a", name: "Different person" }], drives: [{ ...drive, id: "other" }] };
  assert.deepEqual(await importCloudFamily(alice, "import-owner", conflictingFamily), { created: 0, existing: 0, conflicts: 2 });
  assert.equal((await readCloudFamily(alice, "import-owner")).drives.length, 1);
});
after(async () => { if (env) await env.cleanup(); });

test("only the signed-in owner can access private family records", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  const bob = env.authenticatedContext("bob").firestore();
  const guest = env.unauthenticatedContext().firestore();
  const path = "users/alice/learners/learner-1";
  await assertSucceeds(setDoc(doc(alice, path), { id: "learner-1", name: "Test learner" }));
  await assertSucceeds(getDoc(doc(alice, path)));
  await assertFails(getDoc(doc(bob, path)));
  await assertFails(setDoc(doc(bob, path), { name: "Changed" }));
  await assertFails(getDoc(doc(guest, path)));
  await assertFails(setDoc(doc(guest, path), { name: "Changed" }));
  await assertFails(setDoc(doc(alice, "publicRoutes/route-1"), { name: "Not supported" }));
  await assertSucceeds(setDoc(doc(alice, "users/alice/drives/drive-1"), { id: "drive-1", learnerId: "learner-1", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" }));
  await assertFails(getDoc(doc(bob, "users/alice/drives/drive-1")));
});

test("rules reject malformed records, orphaned drives, moves and deletes", async () => {
  const db = env.authenticatedContext("validation-owner").firestore();
  const learnerRef = doc(db, "users/validation-owner/learners/a");
  const driveRef = doc(db, "users/validation-owner/drives/d");
  const learner = { id: "a", name: "Alex" };
  const drive = { id: "d", learnerId: "a", date: "2026-11-01", minutes: 30, nightMinutes: 5, skills: "", notes: "" };
  await assertFails(setDoc(driveRef, drive));
  await assertFails(setDoc(learnerRef, { ...learner, id: "wrong" }));
  await assertFails(setDoc(learnerRef, { ...learner, name: "  " }));
  await assertFails(setDoc(learnerRef, { ...learner, extra: true }));
  await assertSucceeds(setDoc(learnerRef, learner));
  await assertSucceeds(setDoc(doc(db, "users/validation-owner/learners/other"), { id: "other", name: "Other" }));
  await assertSucceeds(setDoc(driveRef, { ...drive, route: { start: "A", end: "B", stops: ["C"] }, location: { latitude: 33, longitude: -82, accuracy: 10, recordedAt: "2026-11-01T12:00:00.000Z" }, practicedSkills: ["Turns"], routeUrl: "https://example.com" }));
  for (const invalid of [
    { ...drive, nightMinutes: 31 }, { ...drive, minutes: 1.5 }, { ...drive, date: "bad" },
    { ...drive, date: "2025-02-29" }, { ...drive, date: "2026-13-01" },
    { ...drive, routeUrl: "javascript:alert(1)" }, { ...drive, practicedSkills: [1] },
    { ...drive, routeUrl: "https://%" }, { ...drive, routeUrl: "https://example.com:99999/" },
    { ...drive, route: { start: "A", end: "B", stops: ["1", "2", "3", "4"] } },
    { ...drive, location: { latitude: 91, longitude: 0, accuracy: 0, recordedAt: "2026-11-01T12:00:00.000Z" } },
    { ...drive, location: { latitude: 0, longitude: 0, accuracy: 0, recordedAt: "2026-99-01T99:00:00.000Z" } },
    { ...drive, location: { latitude: 0, longitude: 0, accuracy: Infinity, recordedAt: "2026-11-01T12:00:00.000Z" } },
    { ...drive, unexpected: true }, { ...drive, learnerId: "other" },
  ]) await assertFails(setDoc(driveRef, invalid));
  await assertSucceeds(setDoc(driveRef, { ...drive, date: "2024-02-29", routeUrl: "https://maps.example.com?query=Augusta" }));
  await assertFails(deleteDoc(learnerRef));
  await assertFails(deleteDoc(driveRef));
});

test("an interrupted import can be retried without overwriting copied records", async () => {
  const db = env.authenticatedContext("retry-owner").firestore();
  const learner = { id: "a", name: "Alex" };
  const drive = { id: "d", learnerId: "a", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" };
  await createCloudRecord(db, "retry-owner", "learners", learner);
  assert.deepEqual(await importCloudFamily(db, "retry-owner", { version: 1, learners: [learner], drives: [drive] }), { created: 1, existing: 1, conflicts: 0 });
  assert.deepEqual(await importCloudFamily(db, "retry-owner", { version: 1, learners: [learner], drives: [drive] }), { created: 0, existing: 2, conflicts: 0 });
});

test("import preflight rejects incompatible later records before copying anything", async () => {
  const db = env.authenticatedContext("preflight-owner").firestore();
  const family = { version: 1, learners: [{ id: "a", name: "Alex" }], drives: [{ id: "d", learnerId: "a", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "x".repeat(1001) }] };
  await assert.rejects(importCloudFamily(db, "preflight-owner", family), /cloud storage limits/);
  assert.deepEqual(await readCloudFamily(db, "preflight-owner"), { version: 1, learners: [], drives: [] });
});

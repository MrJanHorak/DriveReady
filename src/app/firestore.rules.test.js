import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
  await assertSucceeds(setDoc(doc(alice, path), { name: "Test learner" }));
  await assertSucceeds(getDoc(doc(alice, path)));
  await assertFails(getDoc(doc(bob, path)));
  await assertFails(setDoc(doc(bob, path), { name: "Changed" }));
  await assertFails(getDoc(doc(guest, path)));
  await assertFails(setDoc(doc(guest, path), { name: "Changed" }));
  await assertFails(setDoc(doc(alice, "publicRoutes/route-1"), { name: "Not supported" }));
  await assertSucceeds(setDoc(doc(alice, "users/alice/drives/drive-1"), { minutes: 30 }));
  await assertFails(getDoc(doc(bob, "users/alice/drives/drive-1")));
});

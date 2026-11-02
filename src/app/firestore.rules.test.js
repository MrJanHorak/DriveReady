import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, setDoc, writeBatch } from "firebase/firestore";
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
  await assertFails(setDoc(doc(bob, path), { id: "learner-1", name: "Changed" }));
  await assertFails(getDoc(doc(guest, path)));
  await assertFails(setDoc(doc(guest, path), { id: "learner-1", name: "Changed" }));
  await assertFails(getDocs(collection(bob, "users/alice/learners")));
  await assertFails(getDocs(collection(guest, "users/alice/learners")));
  await assertSucceeds(getDocs(collection(alice, "users/alice/learners")));
  await assertFails(setDoc(doc(alice, "publicRoutes/route-1"), { name: "Not supported" }));
  await assertFails(setDoc(doc(alice, "users/alice"), { name: "Not supported" }));
  await assertFails(setDoc(doc(alice, "users/alice/other/record"), { id: "record" }));
  await assertSucceeds(setDoc(doc(alice, "users/alice/drives/drive-1"), { id: "drive-1", learnerId: "learner-1", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" }));
  await assertFails(getDoc(doc(bob, "users/alice/drives/drive-1")));
});

test("a batch mixing authorized and unauthorized writes is rejected atomically", async () => {
  const alice = env.authenticatedContext("batch-alice").firestore();
  const own = doc(alice, "users/batch-alice/learners/a");
  const other = doc(alice, "users/batch-bob/learners/b");
  const batch = writeBatch(alice);
  batch.set(own, { id: "a", name: "Alice learner" });
  batch.set(other, { id: "b", name: "Bob learner" });
  await assertFails(batch.commit());
  assert.equal((await getDoc(own)).exists(), false);
});

test("shared-space foundation permits active members to read history and denies client writes", async () => {
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await setDoc(doc(db, "spaces/space-a"), { label: "Learner space" });
    for (const [uid, role, active] of [["manager-a", "manager", true], ["supervisor-a", "supervisor", true], ["learner-a", "learner", true], ["removed-a", "supervisor", false], ["bad-role", "owner", true]]) {
      await setDoc(doc(db, `spaces/space-a/members/${uid}`), { role, active });
    }
    await setDoc(doc(db, "spaces/space-a/drives/drive-a"), { notes: "Shared practice note" });
    await setDoc(doc(db, "spaces/space-a/routes/route-a"), { title: "Private route" });
    await setDoc(doc(db, "spaces/space-a/private/secret"), { text: "Not a shared path" });
    await setDoc(doc(db, "spaces/space-b"), { label: "Other learner space" });
    await setDoc(doc(db, "spaces/space-b/members/outsider"), { role: "manager", active: true });
    await setDoc(doc(db, "spaces/space-b/drives/drive-b"), { notes: "Other history" });
    await setDoc(doc(db, "users/learner-a/spaceLinks/space-a"), { spaceId: "space-a" });
    await setDoc(doc(db, "users/outsider/spaceLinks/space-a"), { spaceId: "space-a" });
  });
  const manager = env.authenticatedContext("manager-a").firestore();
  const supervisor = env.authenticatedContext("supervisor-a").firestore();
  const learner = env.authenticatedContext("learner-a").firestore();
  const outsider = env.authenticatedContext("outsider").firestore();
  const removed = env.authenticatedContext("removed-a").firestore();
  const invalidRole = env.authenticatedContext("bad-role").firestore();
  const guest = env.unauthenticatedContext().firestore();
  for (const db of [manager, supervisor, learner]) {
    await assertSucceeds(getDocFromServer(doc(db, "spaces/space-a")));
    assert.equal((await assertSucceeds(getDocFromServer(doc(db, "spaces/space-a/drives/drive-a")))).data().notes, "Shared practice note");
    await assertSucceeds(getDocs(collection(db, "spaces/space-a/drives")));
    await assertSucceeds(getDocFromServer(doc(db, "spaces/space-a/routes/route-a")));
    await assertFails(setDoc(doc(db, "spaces/space-a/drives/new"), { notes: "Cannot write yet" }));
    await assertFails(setDoc(doc(db, "spaces/space-a/members/outsider"), { role: "manager", active: true }));
    await assertFails(setDoc(doc(db, "spaces/space-a"), { label: "Cannot alter yet" }));
    await assertFails(deleteDoc(doc(db, "spaces/space-a/drives/drive-a")));
    await assertFails(getDocFromServer(doc(db, "spaces/space-a/private/secret")));
  }
  await assertSucceeds(getDocFromServer(doc(outsider, "spaces/space-b/drives/drive-b")));
  await assertFails(getDocFromServer(doc(manager, "spaces/space-b/drives/drive-b")));
  for (const db of [outsider, removed, invalidRole, guest]) {
    await assertFails(getDocFromServer(doc(db, "spaces/space-a/drives/drive-a")));
    await assertFails(getDocs(collection(db, "spaces/space-a/drives")));
  }
  await assertSucceeds(getDocs(collection(manager, "spaces/space-a/members")));
  await assertFails(getDocs(collection(supervisor, "spaces/space-a/members")));
  await assertSucceeds(getDocFromServer(doc(learner, "spaces/space-a/members/learner-a")));
  await assertFails(getDocFromServer(doc(learner, "spaces/space-a/members/manager-a")));
  await assertSucceeds(getDocFromServer(doc(outsider, "users/outsider/spaceLinks/space-a")));
  await assertFails(setDoc(doc(outsider, "users/outsider/spaceLinks/forged"), { spaceId: "space-a" }));
  await assertFails(getDocFromServer(doc(outsider, "users/learner-a/spaceLinks/space-a")));
  await env.withSecurityRulesDisabled(async (admin) => setDoc(doc(admin.firestore(), "spaces/space-a/members/learner-a"), { role: "learner", active: false }));
  await assertFails(getDocFromServer(doc(learner, "spaces/space-a/drives/drive-a")));
});

test("one manager can access several learners while each learner and invited adult stay scoped", async () => {
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    for (const [space, learner, note] of [["twins-one", "twin-one", "First learner's practice"], ["twins-two", "twin-two", "Second learner's practice"], ["learner-three", "third", "Third learner's practice"], ["learner-four", "fourth", "Fourth learner's practice"]]) {
      await setDoc(doc(db, `spaces/${space}`), { label: space });
      await setDoc(doc(db, `spaces/${space}/members/parent`), { role: "manager", active: true });
      await setDoc(doc(db, `spaces/${space}/members/${learner}`), { role: "learner", active: true });
      await setDoc(doc(db, `spaces/${space}/members/shared-adult`), { role: "supervisor", active: true });
      await setDoc(doc(db, `spaces/${space}/drives/log`), { notes: note });
      await setDoc(doc(db, `users/parent/spaceLinks/${space}`), { spaceId: space });
    }
    await setDoc(doc(db, "spaces/twins-one/members/first-only-adult"), { role: "supervisor", active: true });
  });
  const parent = env.authenticatedContext("parent").firestore();
  const first = env.authenticatedContext("twin-one").firestore();
  const second = env.authenticatedContext("twin-two").firestore();
  const both = env.authenticatedContext("shared-adult").firestore();
  const firstOnly = env.authenticatedContext("first-only-adult").firestore();
  assert.equal((await assertSucceeds(getDocs(collection(parent, "users/parent/spaceLinks")))).size, 4);
  for (const db of [parent, both]) {
    assert.equal((await assertSucceeds(getDocFromServer(doc(db, "spaces/twins-one/drives/log")))).data().notes, "First learner's practice");
    assert.equal((await assertSucceeds(getDocFromServer(doc(db, "spaces/twins-two/drives/log")))).data().notes, "Second learner's practice");
    assert.equal((await assertSucceeds(getDocFromServer(doc(db, "spaces/learner-three/drives/log")))).data().notes, "Third learner's practice");
    assert.equal((await assertSucceeds(getDocFromServer(doc(db, "spaces/learner-four/drives/log")))).data().notes, "Fourth learner's practice");
  }
  await assertSucceeds(getDocFromServer(doc(first, "spaces/twins-one/drives/log")));
  await assertFails(getDocFromServer(doc(first, "spaces/twins-two/drives/log")));
  await assertSucceeds(getDocFromServer(doc(second, "spaces/twins-two/drives/log")));
  await assertFails(getDocFromServer(doc(second, "spaces/twins-one/drives/log")));
  await assertSucceeds(getDocFromServer(doc(firstOnly, "spaces/twins-one/drives/log")));
  await assertFails(getDocFromServer(doc(firstOnly, "spaces/twins-two/drives/log")));
  await assertFails(getDocFromServer(doc(firstOnly, "spaces/learner-three/drives/log")));
  for (const [uid, space] of [["third", "learner-three"], ["fourth", "learner-four"]]) {
    const learner = env.authenticatedContext(uid).firestore();
    await assertSucceeds(getDocFromServer(doc(learner, `spaces/${space}/drives/log`)));
    await assertFails(getDocFromServer(doc(learner, "spaces/twins-one/drives/log")));
    await assertFails(getDocFromServer(doc(learner, `spaces/${space === "learner-three" ? "learner-four" : "learner-three"}/drives/log`)));
  }
  await assertFails(setDoc(doc(first, "users/twin-one/spaceLinks/twins-two"), { spaceId: "twins-two" }));
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
  for (const name of ["\t", "\n", "\u000b", "\f", "\r", " ", "\u00a0", "\u1680", "\u2000", "\u200a", "\u2028", "\u2029", "\u202f", "\u205f", "\u3000", "\ufeff"]) await assertFails(setDoc(learnerRef, { ...learner, name }));
  await assertFails(setDoc(learnerRef, { ...learner, extra: true }));
  await assertSucceeds(setDoc(learnerRef, learner));
  await assertSucceeds(setDoc(doc(db, "users/validation-owner/learners/international"), { id: "international", name: "李 雷" }));
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

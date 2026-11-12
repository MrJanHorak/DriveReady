// Firestore rules: members read their own learner spaces; nothing is writable from the browser.
// Run with npm run test:rules (Firestore emulator).
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDocFromServer, getDocs, setDoc } from "firebase/firestore";
import assert from "node:assert/strict";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-driveready", firestore: { rules: await readFile("firestore.rules", "utf8") } });
});
after(async () => { await env?.cleanup(); });

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

test("retired single-supervisor records and unknown paths are closed to everyone", async () => {
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await setDoc(doc(db, "users/owner/learners/l1"), { id: "l1", name: "Old learner" });
    await setDoc(doc(db, "users/owner/drives/d1"), { id: "d1", learnerId: "l1", notes: "Old drive" });
  });
  const ownerDb = env.authenticatedContext("owner").firestore();
  await assertFails(getDocFromServer(doc(ownerDb, "users/owner/learners/l1")));
  await assertFails(getDocs(collection(ownerDb, "users/owner/drives")));
  await assertFails(setDoc(doc(ownerDb, "users/owner/learners/l2"), { id: "l2", name: "New learner" }));
  await assertFails(setDoc(doc(ownerDb, "users/owner/drives/d2"), { id: "d2", learnerId: "l1" }));
  await assertFails(deleteDoc(doc(ownerDb, "users/owner/drives/d1")));
  await assertFails(getDocFromServer(doc(ownerDb, "users/owner")));
  await assertFails(setDoc(doc(ownerDb, "spaces/new-space"), { learnerName: "Self-made space" }));
  await assertFails(setDoc(doc(ownerDb, "spaces/new-space/members/owner"), { role: "manager", active: true }));
  await assertFails(getDocFromServer(doc(env.unauthenticatedContext().firestore(), "users/owner/learners/l1")));
});

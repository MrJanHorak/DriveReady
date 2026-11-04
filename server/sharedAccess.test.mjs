import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDocFromServer, setDoc } from "firebase/firestore";
import { createSharedAccessService } from "./sharedAccess.mjs";

let adminApp, adminAuth, db, service;
const clientApps = [];
let currentTime = Date.now();
before(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("The local Firebase emulators on ports 8080 and 9099 are required; refusing to run against a real project.");
  adminApp = initializeAdmin({ projectId: "demo-driveready" }, "shared-access-admin");
  adminAuth = getAdminAuth(adminApp);
  db = getAdminFirestore(adminApp);
  service = createSharedAccessService({ db, auth: adminAuth, now: () => currentTime });
});
after(async () => { await Promise.all(clientApps.map(deleteApp)); if (adminApp) await deleteAdmin(adminApp); });

async function account(label, verified = true) {
  const email = `${label}@example.test`, password = "synthetic-password-123";
  const user = await adminAuth.createUser({ email, password, emailVerified: verified });
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-driveready", authDomain: "demo-driveready.firebaseapp.com", appId: "demo-app" }, `client-${label}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, password);
  const clientDb = (await import("firebase/firestore")).getFirestore(app);
  connectFirestoreEmulator(clientDb, "127.0.0.1", 8080);
  return { uid: user.uid, email, token: await auth.currentUser.getIdToken(true), auth, db: clientDb };
}

test("verified managers can create separate spaces; unverified or forged identity cannot", async () => {
  const manager = await account("manager");
  const unverified = await account("unverified", false);
  const disabled = await account("disabled");
  await adminAuth.updateUser(disabled.uid, { disabled: true });
  await assert.rejects(service.createSpace({ idToken: unverified.token, learnerName: "Learner" }), /Not authorized/);
  await assert.rejects(service.createSpace({ idToken: "forged-token", learnerName: "Learner" }), /Not authorized/);
  await assert.rejects(service.createSpace({ idToken: disabled.token, learnerName: "Learner" }), /Not authorized/);
  const one = await service.createSpace({ idToken: manager.token, learnerName: "First learner" });
  const two = await service.createSpace({ idToken: manager.token, learnerName: "Second learner" });
  assert.notEqual(one.spaceId, two.spaceId);
  for (const spaceId of [one.spaceId, two.spaceId]) {
    assert.equal((await db.doc(`spaces/${spaceId}/members/${manager.uid}`).get()).data().role, "manager");
    assert.equal((await db.doc(`users/${manager.uid}/spaceLinks/${spaceId}`).get()).exists, true);
    assert.equal((await getDocFromServer(doc(manager.db, `spaces/${spaceId}`))).exists(), true);
  }
});

test("invitation acceptance is specific, verified, single-use and scoped to one learner", async () => {
  const manager = await account("inviter"), adult = await account("invited"), wrong = await account("wrong"), learner = await account("learner"), otherLearner = await account("other-learner"), unverified = await account("invited-unverified", false);
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Learner" });
  await db.doc(`spaces/${spaceId}/drives/synthetic`).set({ notes: "Shared history" });
  const another = await service.createSpace({ idToken: manager.token, learnerName: "Sibling" });
  await assert.rejects(service.createInvitation({ idToken: adult.token, spaceId, recipientEmail: wrong.email, role: "supervisor" }), /Not authorized/);
  await assert.rejects(service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "manager" }), /invitation role/);
  const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email.toUpperCase(), role: "supervisor" });
  const inviteHash = createHash("sha256").update(invite.token).digest("hex");
  assert.equal((await db.collection(`spaces/${spaceId}/invitations`).get()).docs[0].data().recipientEmail, adult.email);
  assert.equal(JSON.stringify((await db.collection(`spaces/${spaceId}/invitations`).get()).docs[0].data()).includes(invite.token), false);
  await assert.rejects(getDocFromServer(doc(manager.db, `spaces/${spaceId}/invitations/${inviteHash}`)), /permission/i);
  await assert.rejects(getDocFromServer(doc(adult.db, `spaces/${spaceId}/invitations/${inviteHash}`)), /permission/i);
  await assert.rejects(getDocFromServer(doc(adult.db, `spaces/${spaceId}`)), /permission/i);
  await assert.rejects(service.previewInvitation({ idToken: wrong.token, spaceId, token: invite.token }), /cannot be accepted/);
  assert.deepEqual(await service.previewInvitation({ idToken: adult.token, spaceId, token: invite.token }), { learnerName: "Learner", role: "supervisor", expiresAt: invite.expiresAt });
  await assert.rejects(getDocFromServer(doc(adult.db, `spaces/${spaceId}`)), /permission/i);
  assert.equal((await db.doc(`spaces/${spaceId}/members/${adult.uid}`).get()).exists, false);
  await assert.rejects(service.acceptInvitation({ idToken: wrong.token, spaceId, token: invite.token }), /cannot be accepted/);
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId: another.spaceId, token: invite.token }), /cannot be accepted/);
  const race = await Promise.allSettled([service.acceptInvitation({ idToken: adult.token, spaceId, token: invite.token }), service.acceptInvitation({ idToken: adult.token, spaceId, token: invite.token })]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(race.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await getDocFromServer(doc(adult.db, `spaces/${spaceId}`))).exists(), true);
  assert.equal((await getDocFromServer(doc(adult.db, `spaces/${spaceId}/drives/synthetic`))).data().notes, "Shared history");
  await assert.rejects(getDocFromServer(doc(adult.db, `spaces/${another.spaceId}`)), /permission/i);
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: invite.token }), /cannot be accepted/);
  const unverifiedInvite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: unverified.email, role: "supervisor" });
  await assert.rejects(service.acceptInvitation({ idToken: unverified.token, spaceId, token: unverifiedInvite.token }), /Not authorized/);
  await adminAuth.updateUser(unverified.uid, { emailVerified: true });
  unverified.token = await unverified.auth.currentUser.getIdToken(true);
  await service.acceptInvitation({ idToken: unverified.token, spaceId, token: unverifiedInvite.token });
  const learnerInvite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: learner.email, role: "learner" });
  await service.acceptInvitation({ idToken: learner.token, spaceId, token: learnerInvite.token });
  assert.equal((await getDocFromServer(doc(learner.db, `spaces/${spaceId}/drives/synthetic`))).data().notes, "Shared history");
  const replacement = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: otherLearner.email, role: "learner" });
  await assert.rejects(service.acceptInvitation({ idToken: otherLearner.token, spaceId, token: replacement.token }), /cannot be accepted/);
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: learner.uid });
  await assert.rejects(service.acceptInvitation({ idToken: otherLearner.token, spaceId, token: replacement.token }), /cannot be accepted/);
  const reinvite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: learner.email, role: "learner" });
  await service.acceptInvitation({ idToken: learner.token, spaceId, token: reinvite.token });
  await assert.rejects(setDoc(doc(adult.db, `spaces/${spaceId}/members/${wrong.uid}`), { role: "manager", active: true }), /permission/i);
});

test("expiry, cancellation, manager revocation, and member removal take effect", async () => {
  const manager = await account("manager-lifecycle"), adult = await account("adult-lifecycle"), other = await account("other-lifecycle"), later = await account("later-lifecycle");
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Learner" });
  const cancelled = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  const listing = await service.listInvitations({ idToken: manager.token, spaceId });
  assert.equal(listing.invitations.length, 1);
  assert.equal(listing.invitations[0].recipientEmail, adult.email);
  assert.equal(JSON.stringify(listing).includes(cancelled.token), false);
  await assert.rejects(service.listInvitations({ idToken: other.token, spaceId }), /Not authorized/);
  await assert.rejects(service.cancelInvitationById({ idToken: other.token, spaceId, invitationId: listing.invitations[0].id }), /Not authorized/);
  await assert.rejects(service.cancelInvitation({ idToken: other.token, spaceId, token: cancelled.token }), /Not authorized/);
  await service.cancelInvitationById({ idToken: manager.token, spaceId, invitationId: listing.invitations[0].id });
  assert.equal((await service.listInvitations({ idToken: manager.token, spaceId })).invitations.length, 0);
  await assert.rejects(service.previewInvitation({ idToken: adult.token, spaceId, token: cancelled.token }), /cannot be accepted/);
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: cancelled.token }), /cannot be accepted/);
  const expired = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  currentTime = expired.expiresAt;
  assert.equal((await service.listInvitations({ idToken: manager.token, spaceId })).invitations.length, 0);
  await assert.rejects(service.previewInvitation({ idToken: adult.token, spaceId, token: expired.token }), /cannot be accepted/);
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: expired.token }), /cannot be accepted/);
  const stale = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  const otherInvite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: other.email, role: "supervisor" });
  const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  await service.acceptInvitation({ idToken: adult.token, spaceId, token: invite.token });
  const changedEmail = "adult-changed@example.test";
  await adminAuth.updateUser(adult.uid, { email: changedEmail, emailVerified: true });
  await signInWithEmailAndPassword(adult.auth, changedEmail, "synthetic-password-123");
  adult.token = await adult.auth.currentUser.getIdToken(true);
  const changedAddressInvite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: changedEmail, role: "supervisor" });
  await assert.rejects(service.removeMember({ idToken: adult.token, spaceId, memberUid: manager.uid }), /Not authorized/);
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: adult.uid });
  assert.equal((await service.listInvitations({ idToken: manager.token, spaceId })).invitations.length, 0);
  assert.equal((await db.doc(`users/${adult.uid}/spaceLinks/${spaceId}`).get()).exists, false);
  await assert.rejects(getDocFromServer(doc(adult.db, `spaces/${spaceId}`)), /permission/i);
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: stale.token }), /cannot be accepted/);
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: changedAddressInvite.token }), /cannot be accepted/);
  await assert.rejects(service.acceptInvitation({ idToken: other.token, spaceId, token: otherInvite.token }), /cannot be accepted/);
  const freshOther = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: other.email, role: "supervisor" });
  await service.acceptInvitation({ idToken: other.token, spaceId, token: freshOther.token });
  const fresh = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: changedEmail, role: "supervisor" });
  await service.acceptInvitation({ idToken: adult.token, spaceId, token: fresh.token });
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: adult.uid });
  await assert.rejects(service.removeMember({ idToken: manager.token, spaceId, memberUid: manager.uid }), /Not authorized/);
  const pending = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: later.email, role: "supervisor" });
  await db.doc(`spaces/${spaceId}/members/${manager.uid}`).update({ active: false });
  await assert.rejects(service.acceptInvitation({ idToken: later.token, spaceId, token: pending.token }), /cannot be accepted/);
});

test("acceptance and manager cancellation cannot both succeed", async () => {
  const manager = await account("manager-cancel-race"), adult = await account("adult-cancel-race");
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Race learner" });
  const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  const id = (await service.listInvitations({ idToken: manager.token, spaceId })).invitations[0].id;
  const results = await Promise.allSettled([
    service.acceptInvitation({ idToken: adult.token, spaceId, token: invite.token }),
    service.cancelInvitationById({ idToken: manager.token, spaceId, invitationId: id }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
});

test("invitation pages scan past expired records and remain manager-only", async () => {
  const manager = await account("manager-pages"), outsider = await account("outsider-pages");
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Paged learner" });
  const batch = db.batch();
  for (let index = 0; index < 53; index++) {
    const id = index.toString(16).padStart(64, "0");
    batch.set(db.doc(`spaces/${spaceId}/invitations/${id}`), { status: "pending", recipientEmail: `page-${index}@example.test`, role: "supervisor", invitationVersion: 0, managerUid: manager.uid, expiresAt: currentTime + (index < 26 ? -1 : 60_000) });
  }
  await batch.commit();
  const first = await service.listInvitations({ idToken: manager.token, spaceId });
  assert.equal(first.invitations.length, 0);
  assert.ok(first.nextCursor);
  await assert.rejects(service.listInvitations({ idToken: outsider.token, spaceId, cursor: first.nextCursor }), /Not authorized/);
  await assert.rejects(service.listInvitations({ idToken: manager.token, spaceId, cursor: "bad/cursor" }), /Not authorized/);
  const second = await service.listInvitations({ idToken: manager.token, spaceId, cursor: first.nextCursor });
  assert.equal(second.invitations.length, 24);
  assert.ok(second.nextCursor);
  const third = await service.listInvitations({ idToken: manager.token, spaceId, cursor: second.nextCursor });
  assert.equal(third.invitations.length, 3);
  assert.equal(third.nextCursor, null);
  assert.equal(new Set([...second.invitations, ...third.invitations].map((item) => item.id)).size, 27);
});

test("shared drives require active supervisors, preserve attribution and reject duplicate changes", async () => {
  const manager = await account("manager-drive"), adult = await account("adult-drive"), learner = await account("learner-drive"), outsider = await account("outsider-drive");
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Drive learner" });
  const sibling = await service.createSpace({ idToken: manager.token, learnerName: "Other learner" });
  for (const [person, role] of [[adult, "supervisor"], [learner, "learner"]]) {
    const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: person.email, role });
    await service.acceptInvitation({ idToken: person.token, spaceId, token: invite.token });
  }
  const input = { spaceId, operationId: randomUUID(), date: "2026-10-30", minutes: "60", nightMinutes: "15", notes: "Synthetic shared notes", supervisorPresentUid: manager.uid };
  await assert.rejects(service.createDrive({ ...input, idToken: learner.token }), /Not authorized/);
  await assert.rejects(service.createDrive({ ...input, idToken: outsider.token }), /Not authorized/);
  await assert.rejects(service.createDrive({ ...input, idToken: adult.token, supervisorPresentUid: learner.uid }), /Not authorized/);
  await assert.rejects(service.createDrive({ ...input, idToken: adult.token, supervisorPresentUid: outsider.uid }), /Not authorized/);
  await assert.rejects(service.createDrive({ ...input, idToken: adult.token, spaceId: sibling.spaceId }), /Not authorized/);
  for (const changes of [{ date: "2026-02-30" }, { minutes: "0" }, { minutes: "1441" }, { nightMinutes: "61" }, { notes: "x".repeat(1001) }, { operationId: "bad/id" }]) {
    await assert.rejects(service.createDrive({ ...input, ...changes, idToken: adult.token }), /Invalid drive details/);
  }
  const race = await Promise.all([service.createDrive({ ...input, idToken: adult.token }), service.createDrive({ ...input, idToken: adult.token })]);
  assert.deepEqual(race.map((item) => item.created).sort(), [false, true]);
  const saved = (await getDocFromServer(doc(learner.db, `spaces/${spaceId}/drives/${input.operationId}`))).data();
  assert.equal(saved.recordedByUid, adult.uid);
  assert.equal(saved.lastEditedByUid, adult.uid);
  assert.equal(saved.supervisorPresentUid, manager.uid);
  assert.equal(saved.notes, input.notes);
  await assert.rejects(service.createDrive({ ...input, idToken: adult.token, notes: "Changed" }), /conflicts/);
  await assert.rejects(getDocFromServer(doc(outsider.db, `spaces/${spaceId}/drives/${input.operationId}`)), /permission/i);
  await assert.rejects(getDocFromServer(doc(learner.db, `spaces/${sibling.spaceId}/drives/${input.operationId}`)), /permission/i);
  await assert.rejects(setDoc(doc(adult.db, `spaces/${spaceId}/drives/forged`), { recordedByUid: manager.uid }), /permission/i);
  const self = await service.createDrive({ ...input, operationId: randomUUID(), idToken: manager.token });
  assert.equal(self.created, true);
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: adult.uid });
  await assert.rejects(service.createDrive({ ...input, operationId: randomUUID(), idToken: adult.token }), /Not authorized/);
  await assert.rejects(service.createDrive({ ...input, operationId: randomUUID(), supervisorPresentUid: adult.uid, idToken: manager.token }), /Not authorized/);
  assert.equal((await getDocFromServer(doc(learner.db, `spaces/${spaceId}/drives/${input.operationId}`))).data().recordedByUid, adult.uid);
});

test("shared routes are private, supervisor-created and retryable", async () => {
  const manager = await account("manager-route"), adult = await account("adult-route"), learner = await account("learner-route"), outsider = await account("outsider-route");
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Route learner" });
  const sibling = await service.createSpace({ idToken: manager.token, learnerName: "Other route learner" });
  for (const [person, role] of [[adult, "supervisor"], [learner, "learner"]]) {
    const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: person.email, role });
    await service.acceptInvitation({ idToken: person.token, spaceId, token: invite.token });
  }
  const input = { spaceId, operationId: randomUUID(), name: "Fictional route", start: "Example start", destination: "Example destination" };
  await assert.rejects(service.createRoute({ ...input, idToken: learner.token }), /Not authorized/);
  await assert.rejects(service.createRoute({ ...input, idToken: outsider.token }), /Not authorized/);
  await assert.rejects(service.createRoute({ ...input, idToken: adult.token, spaceId: sibling.spaceId }), /Not authorized/);
  for (const changes of [{ name: "  " }, { start: "x".repeat(161) }, { destination: "line\nbreak" }, { operationId: "bad/id" }]) await assert.rejects(service.createRoute({ ...input, ...changes, idToken: adult.token }), /Invalid route details/);
  const attempts = await Promise.all([service.createRoute({ ...input, idToken: adult.token }), service.createRoute({ ...input, idToken: adult.token })]);
  assert.deepEqual(attempts.map((item) => item.created).sort(), [false, true]);
  assert.equal((await getDocFromServer(doc(learner.db, `spaces/${spaceId}/routes/${input.operationId}`))).data().name, input.name);
  await assert.rejects(service.createRoute({ ...input, idToken: adult.token, name: "Changed" }), /conflicts/);
  await assert.rejects(getDocFromServer(doc(outsider.db, `spaces/${spaceId}/routes/${input.operationId}`)), /permission/i);
  await assert.rejects(getDocFromServer(doc(learner.db, `spaces/${sibling.spaceId}/routes/${input.operationId}`)), /permission/i);
  await assert.rejects(setDoc(doc(adult.db, `spaces/${spaceId}/routes/forged`), { name: "Forged" }), /permission/i);
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: adult.uid });
  await assert.rejects(service.createRoute({ ...input, idToken: adult.token }), /Not authorized/);
});

test("a shared drive can reference only a route in the same space and preserves its description", async () => {
  const manager = await account("manager-drive-route"), learner = await account("learner-drive-route");
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Route and drive learner" });
  const other = await service.createSpace({ idToken: manager.token, learnerName: "Other space" });
  const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: learner.email, role: "learner" });
  await service.acceptInvitation({ idToken: learner.token, spaceId, token: invite.token });
  const makeRoute = (space) => service.createRoute({ idToken: manager.token, spaceId: space, operationId: randomUUID(), name: "Original name", start: "Example start", destination: "Example destination" });
  const route = await makeRoute(spaceId), otherRoute = await makeRoute(other.spaceId);
  const drive = { idToken: manager.token, spaceId, operationId: randomUUID(), date: "2026-10-30", minutes: "30", nightMinutes: "5", notes: "Fictional notes", supervisorPresentUid: manager.uid, routeId: route.routeId };
  await assert.rejects(service.createDrive({ ...drive, routeId: "bad/id" }), /Invalid drive details/);
  await assert.rejects(service.createDrive({ ...drive, routeId: otherRoute.routeId }), /Route is unavailable/);
  await assert.rejects(service.createDrive({ ...drive, routeId: randomUUID() }), /Route is unavailable/);
  await assert.rejects(service.createDrive({ ...drive, idToken: learner.token }), /Not authorized/);
  assert.equal((await service.createDrive(drive)).created, true);
  await db.doc(`spaces/${spaceId}/routes/${route.routeId}`).update({ name: "Changed later" });
  assert.equal((await service.createDrive(drive)).created, false);
  await assert.rejects(service.createDrive({ ...drive, routeId: "" }), /conflicts/);
  const saved = (await getDocFromServer(doc(learner.db, `spaces/${spaceId}/drives/${drive.operationId}`))).data();
  assert.equal(saved.routeId, route.routeId);
  assert.deepEqual(saved.routeSnapshot, { name: "Original name", start: "Example start", destination: "Example destination" });
  const legacy = { ...drive, operationId: randomUUID() };
  delete legacy.routeId;
  assert.equal((await service.createDrive(legacy)).created, true);
  assert.equal((await service.createDrive({ ...legacy, routeId: "" })).created, false);
});

test("shared drive edits enforce roles, preserve attribution, reject stale changes and retry safely", async () => {
  const suffix = randomUUID();
  const manager = await account(`manager-edit-${suffix}`), author = await account(`author-edit-${suffix}`), other = await account(`other-edit-${suffix}`), learner = await account(`learner-edit-${suffix}`), outsider = await account(`outsider-edit-${suffix}`);
  const { spaceId } = await service.createSpace({ idToken: manager.token, learnerName: "Edit learner" });
  for (const [person, role] of [[author, "supervisor"], [other, "supervisor"], [learner, "learner"]]) {
    const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: person.email, role });
    await service.acceptInvitation({ idToken: person.token, spaceId, token: invite.token });
  }
  const route = await service.createRoute({ idToken: manager.token, spaceId, operationId: randomUUID(), name: "Original route", start: "Fictional start", destination: "Fictional end" });
  const create = { idToken: author.token, spaceId, operationId: randomUUID(), date: "2026-10-30", minutes: "60", nightMinutes: "15", notes: "Original", supervisorPresentUid: manager.uid, routeId: route.routeId };
  await service.createDrive(create);
  const edit = { idToken: author.token, spaceId, driveId: create.operationId, operationId: randomUUID(), expectedRevision: "0", date: "2026-10-31", minutes: "45", nightMinutes: "10", notes: "Corrected" };
  for (const person of [learner, other, outsider]) await assert.rejects(service.editDrive({ ...edit, idToken: person.token }), /Not authorized/);
  for (const changes of [{ expectedRevision: "-1" }, { date: "2026-02-30" }, { minutes: "0" }, { nightMinutes: "46" }, { notes: "x".repeat(1001) }]) await assert.rejects(service.editDrive({ ...edit, ...changes }), /Invalid drive details/);
  const competing = { ...edit, idToken: manager.token, operationId: randomUUID(), notes: "Manager correction" };
  const race = await Promise.allSettled([service.editDrive(edit), service.editDrive(competing)]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(race.filter((result) => result.status === "rejected").length, 1);
  const winner = race[0].status === "fulfilled" ? edit : competing;
  assert.equal((await service.editDrive(winner)).updated, false);
  await assert.rejects(service.editDrive({ ...winner, notes: "Changed retry" }), /conflicts/);
  const saved = (await getDocFromServer(doc(learner.db, `spaces/${spaceId}/drives/${create.operationId}`))).data();
  assert.equal(saved.recordedByUid, author.uid);
  assert.equal(saved.lastEditedByUid, winner.idToken === author.token ? author.uid : manager.uid);
  assert.equal(saved.supervisorPresentUid, manager.uid);
  assert.equal(saved.routeSnapshot.name, "Original route");
  assert.equal(saved.revision, 1);
  assert.equal(saved.notes, winner.notes);
  await assert.rejects(getDocFromServer(doc(learner.db, `spaces/${spaceId}/driveEditOperations/${winner.operationId}`)), /permission/i);
  await assert.rejects(setDoc(doc(author.db, `spaces/${spaceId}/drives/${create.operationId}`), { notes: "forged" }), /permission/i);
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: author.uid });
  await assert.rejects(service.editDrive({ ...edit, expectedRevision: "1", operationId: randomUUID() }), /Not authorized/);
  const later = { ...edit, idToken: manager.token, expectedRevision: "1", operationId: randomUUID(), notes: "Manager after removal" };
  assert.equal((await service.editDrive(later)).updated, true);
  assert.equal((await service.editDrive(competing.idToken === winner.idToken ? winner : later)).updated, false);
});

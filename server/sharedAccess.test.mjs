import { before, after, test } from "node:test";
import assert from "node:assert/strict";
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
  assert.equal((await db.collection(`spaces/${spaceId}/invitations`).get()).docs[0].data().recipientEmail, adult.email);
  assert.equal(JSON.stringify((await db.collection(`spaces/${spaceId}/invitations`).get()).docs[0].data()).includes(invite.token), false);
  await assert.rejects(getDocFromServer(doc(adult.db, `spaces/${spaceId}`)), /permission/i);
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
  await assert.rejects(service.cancelInvitation({ idToken: other.token, spaceId, token: cancelled.token }), /Not authorized/);
  await service.cancelInvitation({ idToken: manager.token, spaceId, token: cancelled.token });
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: cancelled.token }), /cannot be accepted/);
  const expired = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  currentTime = expired.expiresAt;
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: expired.token }), /cannot be accepted/);
  const stale = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  const otherInvite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: other.email, role: "supervisor" });
  const invite = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  await service.acceptInvitation({ idToken: adult.token, spaceId, token: invite.token });
  await assert.rejects(service.removeMember({ idToken: adult.token, spaceId, memberUid: manager.uid }), /Not authorized/);
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: adult.uid });
  assert.equal((await db.doc(`users/${adult.uid}/spaceLinks/${spaceId}`).get()).exists, false);
  await assert.rejects(getDocFromServer(doc(adult.db, `spaces/${spaceId}`)), /permission/i);
  await assert.rejects(service.acceptInvitation({ idToken: adult.token, spaceId, token: stale.token }), /cannot be accepted/);
  await service.acceptInvitation({ idToken: other.token, spaceId, token: otherInvite.token });
  const fresh = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: adult.email, role: "supervisor" });
  await service.acceptInvitation({ idToken: adult.token, spaceId, token: fresh.token });
  await service.removeMember({ idToken: manager.token, spaceId, memberUid: adult.uid });
  await assert.rejects(service.removeMember({ idToken: manager.token, spaceId, memberUid: manager.uid }), /Not authorized/);
  const pending = await service.createInvitation({ idToken: manager.token, spaceId, recipientEmail: later.email, role: "supervisor" });
  await db.doc(`spaces/${spaceId}/members/${manager.uid}`).update({ active: false });
  await assert.rejects(service.acceptInvitation({ idToken: later.token, spaceId, token: pending.token }), /cannot be accepted/);
});

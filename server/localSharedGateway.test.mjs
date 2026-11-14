import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore } from "firebase/firestore";
import { createLocalSharedGateway } from "./localSharedGateway.mjs";

let adminApp, adminAuth, server, endpoint;
const apps = [];
const origin = "http://127.0.0.1:4173";
before(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Firebase emulators are required.");
  adminApp = initializeAdmin({ projectId: "demo-driveready" }, "gateway-admin");
  adminAuth = getAdminAuth(adminApp);
  server = createServer(createLocalSharedGateway({ db: getAdminFirestore(adminApp), auth: adminAuth }));
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  endpoint = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await Promise.all(apps.map(deleteApp));
  if (adminApp) await deleteAdmin(adminApp);
});
async function account(label) {
  const email = `gateway-${label}@example.test`, password = "synthetic-password-123";
  await adminAuth.createUser({ email, password, emailVerified: true });
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-driveready", authDomain: "demo-driveready.firebaseapp.com", appId: "demo-app" }, `gateway-${label}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, password);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  return { uid: auth.currentUser.uid, email, token: await auth.currentUser.getIdToken(true), db };
}
function post(path, token, body, headers = {}) {
  return fetch(`${endpoint}${path}`, { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("gateway rejects untrusted origins, missing credentials, unexpected fields and oversized input", async () => {
  const preflight = await fetch(`${endpoint}/v1/spaces`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal((await fetch(`${endpoint}/v1/spaces`, { method: "POST", headers: { Origin: "https://attacker.example" } })).status, 403);
  assert.equal((await fetch(`${endpoint}/v1/spaces`, { method: "POST", headers: { Origin: origin } })).status, 401);
  assert.equal((await post("/v1/spaces?token=secret", "fake", { learnerName: "A" })).status, 404);
  assert.equal((await post("/v1/spaces", "fake", { learnerName: "A", idToken: "injected" })).status, 400);
  assert.equal((await post("/v1/spaces", "fake", { learnerName: "x".repeat(33000) })).status, 400);
  const invalid = await post("/v1/spaces", "forged-token", { learnerName: "A" });
  assert.equal(invalid.status, 403);
  assert.deepEqual(await invalid.json(), { error: "Request could not be completed." });
  assert.equal(invalid.headers.get("cache-control"), "no-store");
});

test("gateway verifies accounts and invitation scope before granting access", async () => {
  const suffix = randomUUID();
  const manager = await account(`manager-${suffix}`), learner = await account(`learner-${suffix}`), outsider = await account(`outsider-${suffix}`);
  const created = await post("/v1/spaces", manager.token, { learnerName: "Synthetic learner" });
  assert.equal(created.status, 200);
  const { spaceId } = await created.json();
  const invitation = await post("/v1/invitations", manager.token, { spaceId, recipientEmail: learner.email, role: "learner" });
  assert.equal(invitation.status, 200);
  const { token } = await invitation.json();
  const wrong = await post("/v1/invitations/preview", outsider.token, { spaceId, token });
  assert.equal(wrong.status, 403);
  assert.deepEqual(await wrong.json(), { error: "Request could not be completed." });
  const preview = await post("/v1/invitations/preview", learner.token, { spaceId, token });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).learnerName, "Synthetic learner");
  await assert.rejects(getDocFromServer(doc(learner.db, `spaces/${spaceId}`)), /permission/i);
  assert.equal((await post("/v1/invitations/accept", learner.token, { spaceId, token })).status, 200);
  assert.equal((await getDocFromServer(doc(learner.db, `spaces/${spaceId}`))).exists(), true);
  assert.equal((await post("/v1/invitations/accept", learner.token, { spaceId, token })).status, 403);
  const route = await post("/v1/routes", manager.token, { spaceId, operationId: randomUUID(), name: "Fictional route", start: "Example start", destination: "Example end", geometry: JSON.stringify([{ lat: 33.47, lng: -82.01 }, { lat: 33.48, lng: -82.02 }]), roadPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" });
  assert.equal(route.status, 200);
  const drive = { spaceId, operationId: randomUUID(), date: "2026-10-30", minutes: "45", nightMinutes: "10", notes: "Synthetic notes", supervisorPresentUid: manager.uid, routeId: (await route.json()).routeId };
  assert.equal((await post("/v1/drives", learner.token, drive)).status, 403);
  assert.equal((await post("/v1/drives", manager.token, { ...drive, recordedByUid: learner.uid })).status, 400);
  const noRoute = await post("/v1/drives", manager.token, { ...drive, routeId: "" });
  assert.equal(noRoute.status, 422);
  assert.deepEqual(await noRoute.json(), { error: "Choose a saved route before recording a drive." });
  assert.equal((await getDocFromServer(doc(manager.db, `spaces/${spaceId}/drives/${drive.operationId}`))).exists(), false);
  assert.equal((await post("/v1/drives", manager.token, drive)).status, 200);
  assert.equal((await getDocFromServer(doc(learner.db, `spaces/${spaceId}/drives/${drive.operationId}`))).data().recordedByUid, manager.uid);
});

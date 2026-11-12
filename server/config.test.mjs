import test from "node:test";
import assert from "node:assert/strict";
import { clientAddress, loadConfig } from "./config.mjs";

const account = { type: "service_account", project_id: "driveready-dev", client_email: "svc@driveready-dev.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n" };
const base = { FIREBASE_PROJECT_ID: "driveready-dev", ALLOWED_ORIGINS: "https://driveready.example.app,http://localhost:5173" };

test("valid settings load with defaults", () => {
  const config = loadConfig(base);
  assert.deepEqual(config.allowedOrigins, ["https://driveready.example.app", "http://localhost:5173"]);
  assert.equal(config.port, 8080);
  assert.equal(config.serviceAccount, null);
  assert.equal(config.trustProxy, false);
  assert.equal(config.rateLimitPerMinute, 120);
});

test("service account JSON is accepted raw or base64 and must match the project", () => {
  assert.equal(loadConfig({ ...base, FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) }).serviceAccount.client_email, account.client_email);
  assert.equal(loadConfig({ ...base, FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(account)).toString("base64") }).serviceAccount.project_id, "driveready-dev");
  assert.throws(() => loadConfig({ ...base, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...account, project_id: "other" }) }), /different project/);
  assert.throws(() => loadConfig({ ...base, FIREBASE_SERVICE_ACCOUNT: "not json" }), /service-account JSON/);
  assert.throws(() => loadConfig({ ...base, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ type: "user" }) }), /not a service-account/);
});

test("unsafe or malformed settings are refused", () => {
  assert.throws(() => loadConfig({ ALLOWED_ORIGINS: base.ALLOWED_ORIGINS }), /FIREBASE_PROJECT_ID/);
  assert.throws(() => loadConfig({ FIREBASE_PROJECT_ID: "driveready-dev" }), /ALLOWED_ORIGINS is required/);
  for (const origin of ["http://driveready.example.app", "https://driveready.example.app/", "https://driveready.example.app/app", "*", "localhost:5173"]) {
    assert.throws(() => loadConfig({ ...base, ALLOWED_ORIGINS: origin }), /ALLOWED_ORIGINS/, origin);
  }
  assert.throws(() => loadConfig({ ...base, FIREBASE_PROJECT_ID: "demo-driveready" }), /demo- project/);
  assert.throws(() => loadConfig({ ...base, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" }), /Emulator settings/);
  assert.throws(() => loadConfig({ ...base, PORT: "abc" }), /PORT/);
  assert.throws(() => loadConfig({ ...base, RATE_LIMIT_PER_MINUTE: "0" }), /RATE_LIMIT_PER_MINUTE/);
});

test("emulators are allowed only when explicitly requested with a demo project", () => {
  const emulators = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", ALLOWED_ORIGINS: "http://127.0.0.1:4173" };
  assert.equal(loadConfig({ ...emulators, FIREBASE_PROJECT_ID: "demo-driveready", SHARED_SERVICE_ALLOW_EMULATORS: "true" }).usesEmulators, true);
  assert.throws(() => loadConfig({ ...emulators, FIREBASE_PROJECT_ID: "demo-driveready" }), /Emulator settings/);
  assert.throws(() => loadConfig({ ...emulators, FIREBASE_PROJECT_ID: "driveready-dev", SHARED_SERVICE_ALLOW_EMULATORS: "true" }), /Emulator settings/);
});

test("client address uses the proxy-added forwarded entry only when trusted", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.7" }, socket: { remoteAddress: "10.0.0.2" } };
  assert.equal(clientAddress(req, false), "10.0.0.2");
  assert.equal(clientAddress(req, true), "198.51.100.7");
  assert.equal(clientAddress({ headers: {}, socket: { remoteAddress: "10.0.0.2" } }, true), "10.0.0.2");
});

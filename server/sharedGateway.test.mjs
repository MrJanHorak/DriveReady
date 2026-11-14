import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRateLimiter, createSharedGateway } from "./sharedGateway.mjs";

const origin = "https://driveready.example.app";

async function withServer(options, run) {
  const calls = [];
  const service = { createSpace: async (input) => { calls.push(input); return { spaceId: "space-1" }; }, removeMember: async () => { throw new Error("secret detail"); }, leaveSpace: async () => { throw Object.assign(new Error("Delete the learner spaces you manage first."), { rejected: true }); } };
  const logs = [];
  const server = createServer(createSharedGateway({ service, allowedOrigins: [origin], log: (entry) => logs.push(entry), ...options }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run({ base, calls, logs }); } finally { await new Promise((resolve) => server.close(resolve)); }
}
const post = (base, path, body, headers = {}) => fetch(`${base}${path}`, { method: "POST", headers: { Origin: origin, Authorization: "Bearer token.abc", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("health, CORS preflight and an allowed request work", async () => {
  await withServer({}, async ({ base, calls, logs }) => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const preflight = await fetch(`${base}/v1/spaces`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    const response = await post(base, "/v1/spaces", { learnerName: "Fictional learner" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { spaceId: "space-1" });
    assert.deepEqual(calls, [{ learnerName: "Fictional learner", idToken: "token.abc" }]);
    assert.ok(logs.every((entry) => !JSON.stringify(entry).includes("Fictional") && !JSON.stringify(entry).includes("token")));
  });
});

test("other origins, methods, paths, bodies and missing tokens are refused without detail", async () => {
  await withServer({}, async ({ base }) => {
    assert.equal((await post(base, "/v1/spaces", { learnerName: "x" }, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await fetch(`${base}/v1/spaces`, { method: "POST", body: "{}" })).status, 403);
    assert.equal((await fetch(`${base}/v1/spaces`, { headers: { Origin: origin } })).status, 405);
    assert.equal((await post(base, "/v1/unknown", {})).status, 404);
    assert.equal((await post(base, "/v1/spaces", { learnerName: 5 })).status, 400);
    assert.equal((await post(base, "/v1/spaces", { learnerName: "x", extra: "y" })).status, 400);
    assert.equal((await post(base, "/v1/spaces", { learnerName: "x" }, { Authorization: "" })).status, 401);
    assert.equal((await post(base, "/v1/spaces", { learnerName: "x" }, { "Content-Type": "text/plain" })).status, 415);
    const failed = await post(base, "/v1/members/remove", { spaceId: "s", memberUid: "m" });
    assert.equal(failed.status, 403);
    assert.doesNotMatch(await failed.text(), /secret/);
    const refused = await post(base, "/v1/spaces/leave", { spaceId: "s" });
    assert.equal(refused.status, 422);
    assert.deepEqual(await refused.json(), { error: "Delete the learner spaces you manage first." }, "a refusal that changed nothing explains itself");
  });
});

test("rate limiting rejects bursts per client key and recovers after the window", async () => {
  let time = 0;
  const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time });
  assert.equal(allow("a"), true); assert.equal(allow("a"), true); assert.equal(allow("a"), false);
  assert.equal(allow("b"), true);
  time = 1000;
  assert.equal(allow("a"), true);
  await withServer({ allow: createRateLimiter({ limit: 1 }) }, async ({ base }) => {
    assert.equal((await post(base, "/v1/spaces", { learnerName: "x" })).status, 200);
    const limited = await post(base, "/v1/spaces", { learnerName: "x" });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
  });
});

test("connection checks run before anything else", async () => {
  await withServer({ acceptConnection: () => false }, async ({ base }) => {
    assert.equal((await fetch(`${base}/health`)).status, 403);
  });
});

test("an allowed-origin list is required", () => {
  assert.throws(() => createSharedGateway({ service: {}, allowedOrigins: [] }), /allowed origin/);
});

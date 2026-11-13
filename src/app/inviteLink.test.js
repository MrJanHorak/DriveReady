import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteLink, loadPendingInvite, parseInvite, savePendingInvite, takeInviteFromLocation } from "./inviteLink.js";

const token = "A".repeat(20) + "b-_" + "9".repeat(20);
const spaceId = "Abc123_xyz-SPACE";

function fakeStorage() { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data }; }

test("links put the invitation after # and parse back", () => {
  const link = inviteLink("https://drive-ready.example.test/some/page?x=1#old", spaceId, token);
  assert.equal(link, `https://drive-ready.example.test/some/page#invite=${spaceId}.${token}`);
  assert.deepEqual(parseInvite(link), { spaceId, token });
  assert.deepEqual(parseInvite(`  Join here: ${link}  `), { spaceId, token });
  assert.deepEqual(parseInvite(`#invite=${spaceId}.${token}`), { spaceId, token });
  assert.throws(() => inviteLink("https://x.test/", "bad.id", token));
  assert.throws(() => inviteLink("https://x.test/", spaceId, "short"));
});

test("malformed or altered invitations are rejected", () => {
  for (const text of ["", "invite=", `invite=${spaceId}`, `invite=${spaceId}.${token}x`, `invite=${spaceId}.${token.slice(1)}`, `invite=${spaceId}.${token.replace("b", "+")}`, `xinvite=${spaceId}.${token}`, null, 5, "a".repeat(3000)]) assert.equal(parseInvite(text), null, String(text).slice(0, 40));
});

test("opening a link stores the invitation for this tab and clears the address", () => {
  const storage = fakeStorage();
  globalThis.sessionStorage = storage;
  const calls = [];
  const location = { hash: `#invite=${spaceId}.${token}`, pathname: "/", search: "" };
  const history = { state: null, replaceState: (...args) => calls.push(args) };
  assert.deepEqual(takeInviteFromLocation(location, history), { spaceId, token });
  assert.deepEqual(calls, [[null, "", "/"]]);
  assert.deepEqual(loadPendingInvite(storage), { spaceId, token });
  savePendingInvite(null, storage);
  assert.equal(loadPendingInvite(storage), null);
  assert.equal(takeInviteFromLocation({ hash: "#other", pathname: "/", search: "" }, history), null);
  assert.equal(calls.length, 1);
  delete globalThis.sessionStorage;
});

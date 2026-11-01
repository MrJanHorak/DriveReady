import test from "node:test";
import assert from "node:assert/strict";
import { emptyFamily, formatMinutes, readFamily, STORAGE_KEY, summarizeDrives } from "./familyData.js";

test("new browser starts with an empty family and saved data can be read back", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.deepEqual(readFamily(storage), emptyFamily());
  const family = { version: 1, learners: [{ id: "a", name: "Alex" }], drives: [] };
  storage.setItem(STORAGE_KEY, JSON.stringify(family));
  assert.deepEqual(readFamily(storage), family);
});

test("unreadable or unsupported saved data is rejected rather than replaced", () => {
  assert.throws(() => readFamily({ getItem: () => "not-json" }));
  assert.throws(() => readFamily({ getItem: () => JSON.stringify({ version: 2, learners: [], drives: [] }) }));
});

test("progress sums only the chosen learner and separates night from day", () => {
  const drives = [
    { learnerId: "a", minutes: 90, nightMinutes: 20 },
    { learnerId: "a", minutes: 45, nightMinutes: 45 },
    { learnerId: "b", minutes: 100, nightMinutes: 100 },
  ];
  assert.deepEqual(summarizeDrives(drives, "a"), { totalMinutes: 135, nightMinutes: 65, dayMinutes: 70, count: 2 });
  assert.equal(formatMinutes(135), "2h 15m");
  assert.deepEqual(summarizeDrives(drives, "missing"), { totalMinutes: 0, nightMinutes: 0, dayMinutes: 0, count: 0 });
});

import test from "node:test";
import assert from "node:assert/strict";
import { emptyFamily, formatMinutes, locationMapUrl, placeMapUrl, readFamily, routeMapUrl, STORAGE_KEY, summarizeDrives, validRouteUrl } from "./familyData.js";
import { practiceCoverage, PRACTICE_SKILLS, unrecordedSkills } from "./practiceData.js";

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

test("existing logs without location fields remain readable", () => {
  const old = { version: 1, learners: [{ id: "a", name: "Alex" }], drives: [{ id: "d", learnerId: "a", date: "2026-11-01", minutes: 30, nightMinutes: 0, skills: "", notes: "" }] };
  assert.deepEqual(readFamily({ getItem: () => JSON.stringify(old) }), old);
  assert.equal(summarizeDrives(old.drives, "a").totalMinutes, 30);
});

test("route links require HTTPS and captured coordinates open on a map", () => {
  assert.equal(validRouteUrl(""), true);
  assert.equal(validRouteUrl("https://maps.example/route"), true);
  assert.equal(validRouteUrl("javascript:alert(1)"), false);
  assert.equal(validRouteUrl("not a URL"), false);
  const url = new URL(locationMapUrl({ latitude: 33.5, longitude: -82.1 }));
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.searchParams.get("query"), "33.5,-82.1");
});

test("place and route links preserve addresses and ordered stops", () => {
  const place = new URL(placeMapUrl("Evans, GA"));
  assert.equal(place.searchParams.get("query"), "Evans, GA");
  const route = new URL(routeMapUrl({ start: "Evans, GA", end: "Evans, GA", stops: ["Augusta, GA", "Martinez, GA"] }));
  assert.equal(route.searchParams.get("origin"), "Evans, GA");
  assert.equal(route.searchParams.get("destination"), "Evans, GA");
  assert.equal(route.searchParams.get("waypoints"), "Augusta, GA|Martinez, GA");
  assert.equal(route.searchParams.get("travelmode"), "driving");
});

test("coverage counts each learner's tagged drives, using the latest date and ignoring older free-text logs", () => {
  const drives = [
    { learnerId: "a", date: "2026-01-01", practicedSkills: ["Parking", "Parking"] },
    { learnerId: "a", date: "2026-02-01", practicedSkills: ["Parking"] },
    { learnerId: "a", date: "2026-03-01", skills: "Parking" },
    { learnerId: "b", date: "2026-04-01", practicedSkills: ["Parking"] },
  ];
  assert.deepEqual(practiceCoverage(drives, "a", "practicedSkills", ["Parking", "Turns"]), [
    { label: "Parking", count: 2, lastDate: "2026-02-01" },
    { label: "Turns", count: 0, lastDate: "" },
  ]);
  drives[1].practicedSkills = [];
  assert.deepEqual(practiceCoverage(drives, "a", "practicedSkills", ["Parking"])[0], { label: "Parking", count: 1, lastDate: "2026-01-01" });
});

test("unrecorded practice ideas reflect only the selected learner's tags", () => {
  const drives = [
    { learnerId: "a", date: "2026-01-01", practicedSkills: ["Turns"] },
    { learnerId: "b", date: "2026-01-01", practicedSkills: ["Parking"] },
  ];
  assert.equal(unrecordedSkills(drives, "a").includes("Turns"), false);
  assert.equal(unrecordedSkills(drives, "a").includes("Parking"), true);
  assert.deepEqual(unrecordedSkills([], "a"), PRACTICE_SKILLS);
  assert.deepEqual(unrecordedSkills([{ learnerId: "a", date: "2026-01-01", practicedSkills: PRACTICE_SKILLS }], "a"), []);
});

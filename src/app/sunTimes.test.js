import test from "node:test";
import assert from "node:assert/strict";
import { nightMinutes, sunTimes, PILOT_AREA } from "./sunTimes.js";

const MIN = 60000;
const close = (actual, expectedIso, label) => {
  const diff = Math.abs(actual - Date.parse(expectedIso)) / MIN;
  assert.ok(diff <= 1.5, `${label}: ${new Date(actual).toISOString()} vs ${expectedIso} (${diff.toFixed(1)} min apart)`);
};
const { lat, lng } = PILOT_AREA;

// Reference values from the astral library (independent implementation).
test("sunrise and sunset match reference values within 1.5 minutes", () => {
  const nov = sunTimes(Date.parse("2026-11-12T17:00:00Z"), lat, lng);
  close(nov.sunrise, "2026-11-12T11:57:01Z", "Augusta sunrise, Nov 12");
  close(nov.sunset, "2026-11-12T22:26:58Z", "Augusta sunset, Nov 12");
  const jun = sunTimes(Date.parse("2026-06-21T17:00:00Z"), lat, lng);
  close(jun.sunrise, "2026-06-21T10:18:54Z", "Augusta sunrise, Jun 21");
  close(jun.sunset, "2026-06-22T00:40:43Z", "Augusta sunset, Jun 21 (after midnight UTC)");
  const mar = sunTimes(Date.parse("2026-03-08T17:00:00Z"), lat, lng);
  close(mar.sunrise, "2026-03-08T11:47:40Z", "Augusta sunrise, Mar 8");
  close(mar.sunset, "2026-03-08T23:30:19Z", "Augusta sunset, Mar 8");
});

test("night minutes count only the part of a drive outside daylight", () => {
  // Sunset in Augusta on Nov 12 is about 22:27 UTC (5:27 pm EST).
  assert.equal(nightMinutes(Date.parse("2026-11-12T19:00:00Z"), Date.parse("2026-11-12T20:00:00Z"), lat, lng), 0, "afternoon drive");
  const evening = nightMinutes(Date.parse("2026-11-12T22:00:00Z"), Date.parse("2026-11-12T23:00:00Z"), lat, lng);
  assert.ok(evening >= 31 && evening <= 35, `drive across sunset: ${evening}`);
  assert.equal(nightMinutes(Date.parse("2026-11-13T01:00:00Z"), Date.parse("2026-11-13T01:45:00Z"), lat, lng), 45, "fully after dark");
  const dawn = nightMinutes(Date.parse("2026-11-12T11:30:00Z"), Date.parse("2026-11-12T12:30:00Z"), lat, lng);
  assert.ok(dawn >= 25 && dawn <= 29, `drive across sunrise: ${dawn}`);
  const start = Date.parse("2026-11-12T22:00:00Z"), end = Date.parse("2026-11-13T13:00:00Z");
  const evening2 = sunTimes(start, lat, lng), morning = sunTimes(end, lat, lng);
  const expected = Math.round((end - start - (evening2.sunset - start) - (end - morning.sunrise)) / MIN);
  assert.equal(nightMinutes(start, end, lat, lng), expected, "overnight drive counts sunset to sunrise");
});

test("edge cases are handled without errors", () => {
  assert.equal(nightMinutes(10, 5, lat, lng), 0, "end before start");
  assert.equal(nightMinutes(NaN, 5, lat, lng), 0);
  assert.equal(nightMinutes(0, MIN, 95, 0), 0, "invalid latitude");
  // Polar night and midnight sun.
  assert.equal(nightMinutes(Date.parse("2026-12-21T10:00:00Z"), Date.parse("2026-12-21T11:00:00Z"), 80, 15), 60);
  assert.equal(nightMinutes(Date.parse("2026-06-21T22:00:00Z"), Date.parse("2026-06-21T23:00:00Z"), 80, 15), 0);
});

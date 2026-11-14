import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRoutePolyline, encodeRoutePolyline } from "./routePolyline.js";
import { distanceM, lineLengthM, samplePoints, trimLine } from "./publicLine.js";

// A straight-ish line about 2.2 km long heading north.
const line = Array.from({ length: 21 }, (_, i) => ({ lat: 33.47 + i * 0.001, lng: -82.01 }));

test("polylines round-trip through the encoder", () => {
  const sample = [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }];
  assert.equal(encodeRoutePolyline(sample), "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assert.deepEqual(decodeRoutePolyline(encodeRoutePolyline(line)), line);
});

test("trimming removes about 300 m from each end and keeps the middle", () => {
  const total = lineLengthM(line);
  const trimmed = trimLine(line);
  assert.ok(trimmed);
  assert.ok(Math.abs(distanceM(line[0], trimmed[0]) - 300) < 2, "start moved 300 m");
  assert.ok(Math.abs(distanceM(line[line.length - 1], trimmed[trimmed.length - 1]) - 300) < 2, "end moved 300 m");
  assert.ok(Math.abs(lineLengthM(trimmed) - (total - 600)) < 3);
  assert.equal(trimLine(line.slice(0, 9)), null, "a 900 m route is too short to share safely");
});

test("sampling keeps both ends", () => {
  const sampled = samplePoints(line, 5);
  assert.equal(sampled.length, 5);
  assert.deepEqual(sampled[0], line[0]);
  assert.deepEqual(sampled[4], line[20]);
  assert.equal(samplePoints(line, 50), line);
});

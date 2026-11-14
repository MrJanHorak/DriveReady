import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRoutePolyline, encodeRoutePolyline } from "./routePolyline.js";
import { distanceM, lineLengthM, samplePoints } from "./publicLine.js";

const line = Array.from({ length: 21 }, (_, i) => ({ lat: 33.47 + i * 0.001, lng: -82.01 }));

test("polylines round-trip through the encoder", () => {
  const sample = [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }];
  assert.equal(encodeRoutePolyline(sample), "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assert.deepEqual(decodeRoutePolyline(encodeRoutePolyline(line)), line);
});

test("distances and sampling", () => {
  assert.ok(Math.abs(distanceM(line[0], line[1]) - 111.2) < 0.5);
  assert.ok(Math.abs(lineLengthM(line) - 2224) < 5);
  const sampled = samplePoints(line, 5);
  assert.equal(sampled.length, 5);
  assert.deepEqual([sampled[0], sampled[4]], [line[0], line[20]]);
  assert.equal(samplePoints(line, 50), line);
});

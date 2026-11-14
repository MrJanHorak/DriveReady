import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRoutePolyline, encodeRoutePolyline } from "./routePolyline.js";
import { distanceM, lineLengthM, publicLine, samplePoints, validPrivatePlaces } from "./publicLine.js";

// About 2.2 km heading north.
const line = Array.from({ length: 21 }, (_, i) => ({ lat: 33.47 + i * 0.001, lng: -82.01 }));
const nearest = (shared, place) => Math.min(...shared.map((p) => distanceM(p, place)));

test("polylines round-trip through the encoder", () => {
  const sample = [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }];
  assert.equal(encodeRoutePolyline(sample), "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assert.deepEqual(decodeRoutePolyline(encodeRoutePolyline(line)), line);
});

test("nothing within the privacy circle of the start or end is shared", () => {
  const shared = publicLine(line, [], 500);
  assert.ok(shared);
  assert.ok(nearest(shared, line[0]) > 500 && nearest(shared, line[0]) < 525);
  assert.ok(nearest(shared, line[20]) > 500 && nearest(shared, line[20]) < 525);
  assert.ok(Math.abs(lineLengthM(shared) - (lineLengthM(line) - 1000)) < 50);
  assert.equal(publicLine(line.slice(0, 13), [], 500), null, "too little left of a 1.3 km route");
});

test("a loop that starts and ends at home never comes near home", () => {
  // Out 1.5 km north, across 1 km, and back south to the start.
  const home = { lat: 33.47, lng: -82.01 };
  const loop = [home, { lat: 33.4835, lng: -82.01 }, { lat: 33.4835, lng: -81.9993 }, { lat: 33.47, lng: -81.9993 }, home];
  const shared = publicLine(loop, [], 400);
  assert.ok(shared);
  assert.ok(nearest(shared, home) > 400);
});

test("private places along the route split it and only the longest safe stretch is shared", () => {
  const school = line[8];
  const shared = publicLine(line, [school], 400);
  assert.ok(shared);
  assert.ok(nearest(shared, school) > 400);
  assert.ok(nearest(shared, line[0]) > 400 && nearest(shared, line[20]) > 400);
  assert.ok(shared[0].lat > school.lat, "the longer stretch, north of the school, is kept");
  assert.equal(publicLine(line, [line[10]], 600), null, "a private place in the middle can leave nothing safe to share");
});

test("private places are validated and points are sampled with both ends kept", () => {
  assert.equal(validPrivatePlaces([]), true);
  assert.equal(validPrivatePlaces([{ lat: 33.4, lng: -82 }]), true);
  for (const bad of [null, "x", [{ lat: 91, lng: 0 }], [{ lat: "1", lng: 2 }], Array(6).fill({ lat: 1, lng: 1 })]) assert.equal(validPrivatePlaces(bad), false);
  const sampled = samplePoints(line, 5);
  assert.equal(sampled.length, 5);
  assert.deepEqual([sampled[0], sampled[4]], [line[0], line[20]]);
});

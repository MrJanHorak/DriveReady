import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeRoutePolyline } from "./routePolyline.js";

test("decodes a known precision-5 route in latitude/longitude order", () => {
  assert.deepEqual(decodeRoutePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    { lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 },
  ]);
});

test("rejects truncated, malformed, oversized and degenerate lines", () => {
  for (const value of ["", "?", "??", "????", "? ", "~".repeat(7), "?".repeat(12001), "??".repeat(3001)]) assert.throws(() => decodeRoutePolyline(value));
});

test("the fictional demo route has valid road geometry near its waypoints", () => {
  const script = readFileSync(new URL("../../scripts/shared-demo.mjs", import.meta.url), "utf8");
  const literal = script.match(/const roadPolyline = ("(?:[^"\\]|\\.)*");/)?.[1];
  assert.ok(literal);
  const points = decodeRoutePolyline(JSON.parse(literal));
  assert.ok(points.length > 2);
  assert.ok(points.every(({ lat, lng }) => lat > 33.46 && lat < 33.49 && lng > -82.03 && lng < -82.00));
});

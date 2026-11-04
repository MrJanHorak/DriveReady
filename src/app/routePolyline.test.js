import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRoutePolyline } from "./routePolyline.js";

test("decodes a known precision-5 route in latitude/longitude order", () => {
  assert.deepEqual(decodeRoutePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    { lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 },
  ]);
});

test("rejects truncated, malformed, oversized and degenerate lines", () => {
  for (const value of ["", "?", "??", "????", "? ", "~".repeat(7), "?".repeat(12001), "??".repeat(3001)]) assert.throws(() => decodeRoutePolyline(value));
});

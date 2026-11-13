import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ROUTING_URL, DEFAULT_TILE_URL, routingBase, routingRequest, tileSource } from "./mapProviders.js";

const points = [{ lat: 33.47, lng: -82.01 }, { lat: 33.48, lng: -82.02 }];

test("routing defaults to the public OSRM demo and accepts only safe custom addresses", () => {
  assert.deepEqual(routingBase(undefined), { url: DEFAULT_ROUTING_URL, custom: false, valid: true });
  assert.deepEqual(routingBase(""), { url: DEFAULT_ROUTING_URL, custom: false, valid: true });
  assert.equal(routingBase("https://osrm.example.test/").url, "https://osrm.example.test");
  assert.equal(routingBase("https://api.example.test/osrm/?key=abc").url, "https://api.example.test/osrm?key=abc");
  assert.equal(routingBase("http://127.0.0.1:5000").valid, true);
  for (const bad of ["http://osrm.example.test", "ftp://osrm.example.test", "https://user:pw@osrm.example.test", "not a url", "javascript:alert(1)"]) assert.equal(routingBase(bad).valid, false, bad);
});

test("route requests keep the provider's path and query", () => {
  const url = routingRequest(routingBase("https://api.example.test/osrm?key=abc").url, points);
  assert.equal(url.origin + url.pathname, "https://api.example.test/osrm/route/v1/driving/-82.01000,33.47000;-82.02000,33.48000");
  assert.equal(url.searchParams.get("key"), "abc");
  assert.equal(url.searchParams.get("geometries"), "polyline");
  assert.equal(url.searchParams.get("radiuses"), "150;150");
  assert.equal(routingRequest(DEFAULT_ROUTING_URL, points).href.startsWith("https://router.project-osrm.org/route/v1/driving/"), true);
});

test("tile attribution defaults to OpenStreetMap and custom text is escaped", () => {
  assert.equal(tileSource(undefined).url, DEFAULT_TILE_URL);
  assert.equal(tileSource(undefined).custom, false);
  assert.match(tileSource(undefined).attribution, /OpenStreetMap/);
  const custom = tileSource("https://tiles.example.test/{z}/{x}/{y}.png", "© Example <Maps> & OSM");
  assert.equal(custom.custom, true);
  assert.equal(custom.attribution, "© Example &lt;Maps&gt; &amp; OSM");
  assert.match(tileSource("https://tiles.example.test/{z}/{x}/{y}.png").attribution, /OpenStreetMap/);
});

import { decodeRoutePolyline } from "./routePolyline";
import { routing, routingRequest } from "./mapProviders";

// Asks the configured OSRM-compatible server (VITE_ROUTING_URL; the public demo by
// default) for a road route. Called only after the user requests one.
export async function followRoads(points, signal) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 50 || points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 85 || Math.abs(point.lng) > 180)) throw new Error("Select at least two valid points.");
  if (!routing.valid) throw new Error("Road snapping isn't set up correctly on this site (VITE_ROUTING_URL).");
  const url = routingRequest(routing.url, points);
  const response = await fetch(url, { signal, credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error("Could not find a road route. Check the points and try again.");
  const data = await response.json();
  if (data?.code !== "Ok" || !Array.isArray(data.routes) || typeof data.routes[0]?.geometry !== "string") throw new Error("Could not find a road route. Move the points closer to roads and try again.");
  const encoded = data.routes[0].geometry;
  return { encoded, path: decodeRoutePolyline(encoded) };
}

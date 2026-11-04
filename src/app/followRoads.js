import { decodeRoutePolyline } from "./routePolyline";

// Local fictional-data demo only. Called only after the user requests a route.
export async function followRoads(points, signal) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 50 || points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 85 || Math.abs(point.lng) > 180)) throw new Error("Select at least two valid points.");
  const coordinates = points.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(";");
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coordinates}`);
  url.search = new URLSearchParams({ geometries: "polyline", overview: "full", steps: "false", generate_hints: "false", radiuses: points.map(() => "150").join(";") }).toString();
  const response = await fetch(url, { signal, credentials: "omit", redirect: "error" });
  if (!response.ok) throw new Error("Could not find a road route. Check the points and try again.");
  const data = await response.json();
  if (data?.code !== "Ok" || !Array.isArray(data.routes) || typeof data.routes[0]?.geometry !== "string") throw new Error("Could not find a road route. Move the points closer to roads and try again.");
  const encoded = data.routes[0].geometry;
  return { encoded, path: decodeRoutePolyline(encoded) };
}

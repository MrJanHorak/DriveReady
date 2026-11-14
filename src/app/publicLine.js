// Prepares a route line for the public library. Learners often start or end at home
// and loops come back past it, so every part of the line that comes within a privacy
// circle of the start, the end, or any private place the manager marked is removed,
// wherever along the route it happens. Only the longest remaining stretch is shared.
const EARTH_M = 6371008.8;
const rad = (deg) => (deg * Math.PI) / 180;
export const MIN_PRIVACY_RADIUS_M = 400;
export const MAX_PRIVACY_RADIUS_M = 600;
export const MIN_SHARED_LENGTH_M = 400;
export const MAX_PRIVATE_PLACES = 5;

/** Distance in metres between two points. */
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function lineLengthM(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceM(points[i - 1], points[i]);
  return total;
}
const round5 = (value) => Math.round(value * 1e5) / 1e5;

// Adds points so no step is longer than `stepM`; cuts are then accurate to that.
function densify(points, stepM = 20) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i], parts = Math.ceil(distanceM(a, b) / stepM);
    for (let k = 1; k <= parts; k += 1) out.push({ lat: a.lat + ((b.lat - a.lat) * k) / parts, lng: a.lng + ((b.lng - a.lng) * k) / parts });
  }
  return out;
}

/** Valid private places: up to five {lat, lng} points. @param {unknown} value */
export function validPrivatePlaces(value) {
  return Array.isArray(value) && value.length <= MAX_PRIVATE_PLACES && value.every((p) => p && typeof p === "object" && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
}

/**
 * The part of a route that may be shared, or null when too little is left.
 * @param {{lat:number,lng:number}[]} points the full road line
 * @param {{lat:number,lng:number}[]} privatePlaces extra places to keep clear of
 * @param {number} radiusM privacy circle radius
 */
export function publicLine(points, privatePlaces = [], radiusM = MIN_PRIVACY_RADIUS_M) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const centers = [points[0], points[points.length - 1], ...privatePlaces];
  const outside = (p) => centers.every((c) => distanceM(p, c) > radiusM);
  let best = [], bestLength = 0, run = [];
  const finish = () => { const length = lineLengthM(run); if (length > bestLength) { best = run; bestLength = length; } run = []; };
  for (const point of densify(points)) { if (outside(point)) run.push(point); else if (run.length) finish(); }
  if (run.length) finish();
  if (bestLength < MIN_SHARED_LENGTH_M) return null;
  return best.map((p) => ({ lat: round5(p.lat), lng: round5(p.lng) }));
}

/** Keeps at most `max` points, always including both ends. */
export function samplePoints(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

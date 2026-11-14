// Prepares a route line for the public library. The first and last stretch of a
// learner's route is often their street, so both are cut off before sharing.
const EARTH_M = 6371008.8;
const rad = (deg) => (deg * Math.PI) / 180;

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
function pointAlong(points, targetM) {
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const step = distanceM(points[i - 1], points[i]);
    if (walked + step >= targetM) {
      const t = step ? (targetM - walked) / step : 0;
      return { index: i, point: { lat: round5(points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t), lng: round5(points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t) } };
    }
    walked += step;
  }
  return { index: points.length - 1, point: points[points.length - 1] };
}

/** Removes `trimM` metres from each end. Returns null when too little would be left. */
export function trimLine(points, trimM = 300, minRemainingM = 400) {
  const total = lineLengthM(points);
  if (total - 2 * trimM < minRemainingM) return null;
  const start = pointAlong(points, trimM), end = pointAlong(points, total - trimM);
  const middle = points.slice(start.index, end.index).map((p) => ({ lat: round5(p.lat), lng: round5(p.lng) }));
  return [start.point, ...middle, end.point];
}

/** Keeps at most `max` points, always including both ends. */
export function samplePoints(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

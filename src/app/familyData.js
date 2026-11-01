export const STORAGE_KEY = "driveready.family.v1";

export function emptyFamily() {
  return { version: 1, learners: [], drives: [] };
}

export function readFamily(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyFamily();
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.learners) || !Array.isArray(data.drives)) {
    throw new Error("The saved data has an unsupported format.");
  }
  return data;
}

export function summarizeDrives(drives, learnerId) {
  const own = drives.filter((drive) => drive.learnerId === learnerId);
  const totalMinutes = own.reduce((sum, drive) => sum + drive.minutes, 0);
  const nightMinutes = own.reduce((sum, drive) => sum + drive.nightMinutes, 0);
  return { totalMinutes, nightMinutes, dayMinutes: totalMinutes - nightMinutes, count: own.length };
}

export function formatMinutes(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function validRouteUrl(value) {
  if (!value.trim()) return true;
  try { return new URL(value.trim()).protocol === "https:"; }
  catch { return false; }
}

export function locationMapUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
}

export function placeMapUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.trim())}`;
}

export function routeMapUrl(route) {
  const params = new URLSearchParams({ api: "1", origin: route.start, destination: route.end, travelmode: "driving" });
  if (route.stops.length) params.set("waypoints", route.stops.join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

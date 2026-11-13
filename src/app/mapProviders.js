// Map tile and road-routing providers, chosen at build time. The defaults are the
// public OpenStreetMap tiles and OSRM demo server, which are for light testing only.
export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_ROUTING_URL = "https://router.project-osrm.org";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const loopback = (url) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

// An OSRM-compatible server's base address. https only, except on this computer.
// It may include a path and query (for example an API key), kept on every request.
export function routingBase(value) {
  if (!value) return { url: DEFAULT_ROUTING_URL, custom: false, valid: true };
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url))) throw new Error("insecure");
    if (url.username || url.password || url.hash) throw new Error("unsupported");
    url.pathname = url.pathname.replace(/\/+$/, "");
    return { url: url.toString().replace(/\/(?=\?|$)/, ""), custom: true, valid: true };
  } catch {
    return { url: "", custom: true, valid: false };
  }
}

// Builds the request for a driving route through the given points.
export function routingRequest(base, points) {
  const url = new URL(base);
  const coordinates = points.map((point) => `${point.lng.toFixed(5)},${point.lat.toFixed(5)}`).join(";");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/route/v1/driving/${coordinates}`;
  for (const [key, value] of Object.entries({ geometries: "polyline", overview: "full", steps: "false", generate_hints: "false", radiuses: points.map(() => "150").join(";") })) url.searchParams.set(key, value);
  return url;
}

// Tile template plus attribution. A custom provider needs its own attribution text
// (shown as plain text); without one, OpenStreetMap is credited as the data source.
export function tileSource(template, attribution) {
  const custom = !!template && template.trim() !== DEFAULT_TILE_URL;
  const text = attribution?.trim();
  return { url: template?.trim() || DEFAULT_TILE_URL, custom, attribution: text ? escapeHtml(text) : OSM_ATTRIBUTION };
}

const env = import.meta.env ?? {};
export const routing = routingBase(env.VITE_ROUTING_URL);
export const tiles = tileSource(env.VITE_MAP_TILE_URL, env.VITE_MAP_TILE_ATTRIBUTION);

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { tiles as tileProvider } from "./mapProviders";
import { MIN_PRIVACY_RADIUS_M } from "./publicLine";
import type { RoutePoint } from "./RouteMap";

// Circles use the smallest privacy radius, matching the preview line (the most that
// could be shared); the service uses 400–600 m. Shows what sharing a route would publish: the full route faint and dashed, the part
// that would be shared in teal, and red privacy circles around the start, the end and
// each private place. Clicking (or tapping) the map marks another private place.
export default function PrivacyPreviewMap({ route, shared, places, onAddPlace, label }: { route: RoutePoint[]; shared: RoutePoint[] | null; places: RoutePoint[]; onAddPlace: (point: RoutePoint) => void; label: string }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup | null>(null);
  const add = useRef(onAddPlace);
  add.current = onAddPlace;
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { zoomControl: true }).setView([33.4735, -82.0105], 13);
    const tiles = L.tileLayer(tileProvider.url, { maxZoom: 19, attribution: tileProvider.attribution });
    let loaded = 0, failed = 0;
    tiles.on("tileload", () => { loaded += 1; setUnavailable(false); });
    tiles.on("tileerror", () => { failed += 1; });
    tiles.on("load", () => { if (failed && !loaded) setUnavailable(true); });
    tiles.addTo(instance);
    layers.current = L.layerGroup().addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) => add.current({ lat: Number(event.latlng.lat.toFixed(5)), lng: Number(event.latlng.lng.toFixed(5)) }));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    map.current = instance;
    return () => { observer.disconnect(); map.current = null; layers.current = null; instance.remove(); };
  }, []);
  // Fit to the route once per route.
  const fitted = useRef("");
  useEffect(() => {
    const instance = map.current;
    const key = route.length ? `${route[0].lat},${route[0].lng},${route.length}` : "";
    if (!instance || !key || fitted.current === key) return;
    fitted.current = key;
    instance.fitBounds(L.latLngBounds(route.map((p) => [p.lat, p.lng] as L.LatLngTuple)).pad(0.25), { animate: false, maxZoom: 16 });
  }, [route]);
  useEffect(() => {
    const group = layers.current;
    if (!group) return;
    group.clearLayers();
    if (route.length < 2) return;
    const circle = (center: RoutePoint) => L.circle([center.lat, center.lng], { radius: MIN_PRIVACY_RADIUS_M, color: "#c2410c", weight: 1, fillColor: "#ef4444", fillOpacity: 0.12, interactive: false }).addTo(group);
    L.polyline(route.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: "#64748b", weight: 3, opacity: 0.6, dashArray: "6 6", interactive: false }).addTo(group);
    if (shared) L.polyline(shared.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: "#087e8f", weight: 6, opacity: 0.95, interactive: false }).addTo(group);
    [route[0], route[route.length - 1], ...places].forEach(circle);
    places.forEach((place, index) => L.marker([place.lat, place.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#b91c1c;color:#fff;font:600 11px Inter,sans-serif;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3)">${index + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(group));
  }, [route, shared, places]);
  return <div className="relative z-0 h-80 overflow-hidden rounded-xl bg-[#e3ece8] lg:h-[460px]">
    <div ref={element} role="region" aria-label={label} className="h-full w-full cursor-crosshair" />
    {unavailable && <span role="status" className="absolute right-2 top-2 z-[500] rounded bg-white/95 px-2 py-1 text-xs text-slate-700 shadow">Map unavailable</span>}
    <div className="pointer-events-none absolute bottom-6 left-3 right-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-xl border border-border bg-card/95 px-3 py-2 text-[11px] shadow-sm sm:right-auto">
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded bg-[#087e8f]" />Shared</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-slate-500" />Not shared</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-orange-700 bg-red-500/20" />Kept private</span>
    </div>
  </div>;
}

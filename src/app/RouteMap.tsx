import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { tiles as tileProvider } from "./mapProviders";

export type RoutePoint = { lat: number; lng: number };
const initialCenter: L.LatLngExpression = [33.4735, -82.0105];

// interactive: drawing map (click adds points). browse: pan/zoom a saved route without drawing.
export default function RouteMap({ points, path, onAddPoint, interactive = false, browse = false, heightClass, label }: { points: RoutePoint[]; path?: RoutePoint[]; onAddPoint?: (point: RoutePoint) => void; interactive?: boolean; browse?: boolean; heightClass?: string; label: string }) {
  const navigable = interactive || browse;
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const lines = useRef<L.LayerGroup | null>(null);
  const addPoint = useRef(onAddPoint);
  addPoint.current = onAddPoint;
  const [visible, setVisible] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { rootMargin: "100px" });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !element.current) return;
    const instance = L.map(element.current, { zoomControl: navigable, dragging: navigable, scrollWheelZoom: navigable, doubleClickZoom: navigable, touchZoom: navigable, boxZoom: navigable, keyboard: navigable, attributionControl: true }).setView(initialCenter, 13);
    element.current.dataset.zoom = String(instance.getZoom());
    instance.on("zoomend", () => { if (element.current) element.current.dataset.zoom = String(instance.getZoom()); });
    const tiles = L.tileLayer(tileProvider.url, { maxZoom: 19, attribution: tileProvider.attribution });
    let loadedTiles = 0, failedTiles = 0;
    tiles.on("loading", () => { loadedTiles = 0; failedTiles = 0; });
    tiles.on("tileload", () => { loadedTiles += 1; setMapUnavailable(false); });
    tiles.on("tileerror", () => { failedTiles += 1; });
    tiles.on("load", () => { if (failedTiles && !loadedTiles) setMapUnavailable(true); });
    tiles.addTo(instance);
    const group = L.layerGroup().addTo(instance);
    if (interactive) instance.on("click", (event: L.LeafletMouseEvent) => addPoint.current?.({ lat: Number(event.latlng.lat.toFixed(5)), lng: Number(event.latlng.lng.toFixed(5)) }));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    map.current = instance; lines.current = group;
    return () => { observer.disconnect(); map.current = null; lines.current = null; instance.remove(); };
  }, [visible, interactive, navigable]);
  useEffect(() => {
    const instance = map.current, group = lines.current;
    if (!instance || !group) return;
    group.clearLayers();
    if (!points.length) return;
    const coordinates = (path ?? points).map((point) => [point.lat, point.lng] as L.LatLngTuple);
    L.polyline(coordinates, { color: "#087e8f", weight: navigable ? 5 : 4, opacity: 0.9 }).addTo(group);
    points.forEach((point, index) => L.circleMarker([point.lat, point.lng], { radius: navigable ? 5 : 4, color: "#fff", weight: 2, fillColor: index === 0 ? "#138f69" : index === points.length - 1 ? "#df8250" : "#087e8f", fillOpacity: 1 }).addTo(group));
    if (!interactive) instance.fitBounds(L.latLngBounds(coordinates), { padding: browse ? [40, 40] : [20, 20], maxZoom: browse ? 16 : 15, animate: false });
    else if (points.length === 1) instance.setView(coordinates[0], Math.max(instance.getZoom(), 13), { animate: false });
  }, [points, path, visible, interactive, browse]);
  return <div className={`relative z-0 overflow-hidden rounded-xl bg-[#e3ece8] ${heightClass ?? (interactive ? "h-72 sm:h-96" : "h-32 sm:h-36")}`}><div ref={element} role="region" aria-label={label} className="h-full w-full" />{mapUnavailable && <span role="status" className="absolute right-2 top-2 z-[500] rounded bg-white/95 px-2 py-1 text-xs text-slate-700 shadow">Map unavailable</span>}</div>;
}

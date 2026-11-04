import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export type RoutePoint = { lat: number; lng: number };
const initialCenter: L.LatLngExpression = [33.4735, -82.0105];
// The demo tile source can be switched without rebuilding application code.
const tileUrl = import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function RouteMap({ points, path, onAddPoint, interactive = false, label }: { points: RoutePoint[]; path?: RoutePoint[]; onAddPoint?: (point: RoutePoint) => void; interactive?: boolean; label: string }) {
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
    const instance = L.map(element.current, { zoomControl: interactive, dragging: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, touchZoom: interactive, boxZoom: interactive, keyboard: interactive, attributionControl: true }).setView(initialCenter, 13);
    element.current.dataset.zoom = String(instance.getZoom());
    instance.on("zoomend", () => { if (element.current) element.current.dataset.zoom = String(instance.getZoom()); });
    const tiles = L.tileLayer(tileUrl, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' });
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
  }, [visible, interactive]);
  useEffect(() => {
    const instance = map.current, group = lines.current;
    if (!instance || !group) return;
    group.clearLayers();
    if (!points.length) return;
    const coordinates = (path ?? points).map((point) => [point.lat, point.lng] as L.LatLngTuple);
    L.polyline(coordinates, { color: "#087e8f", weight: interactive ? 5 : 4, opacity: 0.9 }).addTo(group);
    points.forEach((point, index) => L.circleMarker([point.lat, point.lng], { radius: interactive ? 5 : 4, color: "#fff", weight: 2, fillColor: index === 0 ? "#138f69" : index === points.length - 1 ? "#df8250" : "#087e8f", fillOpacity: 1 }).addTo(group));
    if (!interactive) instance.fitBounds(L.latLngBounds(coordinates), { padding: [20, 20], maxZoom: 15, animate: false });
    else if (points.length === 1) instance.setView(coordinates[0], Math.max(instance.getZoom(), 13), { animate: false });
  }, [points, path, visible, interactive]);
  return <div className={`relative z-0 overflow-hidden rounded-xl bg-[#e3ece8] ${interactive ? "h-72 sm:h-96" : "h-32 sm:h-36"}`}><div ref={element} role="region" aria-label={label} className="h-full w-full" />{mapUnavailable && <span role="status" className="absolute right-2 top-2 z-[500] rounded bg-white/95 px-2 py-1 text-xs text-slate-700 shadow">Map unavailable</span>}</div>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { readSharedRoutes, sharedAccessRequest } from "./sharedAccessEmulator";
import SharedRouteCard from "./SharedRouteCard";
import RouteMap, { type RoutePoint } from "./RouteMap";
import { decodeRoutePolyline } from "./routePolyline";
import { followRoads } from "./followRoads";

type Space = { id: string; learnerName: string; role: string };
type Route = { id: string; name: string; start: string; destination: string; geometry?: RoutePoint[]; roadPolyline?: string };
type Draft = { spaceId: string; operationId: string; name: string; start: string; destination: string; geometry: string; roadPolyline: string };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

export default function SharedRoutesEmulator({ uid, spaces, blocked, run, createRequest, onCreated, activePage }: { uid: string; spaces: Space[]; blocked: boolean; run: (action: () => Promise<void>) => Promise<void>; createRequest: { spaceId: string; nonce: string } | null; onCreated: (spaceId: string, routeId: string) => void; activePage: boolean }) {
  const [selected, setSelected] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [roadPolyline, setRoadPolyline] = useState("");
  const [routing, setRouting] = useState(false);
  const [routingMessage, setRoutingMessage] = useState("");
  const routeRequest = useRef<AbortController | null>(null);
  const routeRequestVersion = useRef(0);
  const lastRouteRequest = useRef(0);
  const roadPath = useMemo(() => roadPolyline ? decodeRoutePolyline(roadPolyline) : undefined, [roadPolyline]);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [pending, setPending] = useState<Draft | null>(null);
  const pendingRef = useRef<Draft | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const alive = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; routeRequestVersion.current += 1; routeRequest.current?.abort(); }; }, []);
  useEffect(() => { setSelected((current) => spaces.some((space) => space.id === current) ? current : (pendingRef.current ? "" : spaces[0]?.id ?? "")); }, [spaces]);
  useEffect(() => {
    if (!createRequest) return;
    if (pendingRef.current) { setMessage("Finish or discard the pending route save first."); return; }
    if (selected !== createRequest.spaceId && (name || start || destination || points.length) && !window.confirm("Move the unfinished route to the selected learner’s space?")) return;
    setSelected(createRequest.spaceId);
    nameInput.current?.focus();
  }, [createRequest]);
  useEffect(() => { if (createRequest && selected === createRequest.spaceId) nameInput.current?.focus(); }, [createRequest, selected]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setRoutes([]); setCursor(null); setError(false); loadingMoreRef.current = false; setLoadingMore(false);
    if (!selected) return;
    try {
      const result = await readSharedRoutes(uid, selected);
      if (alive.current && request === generation.current) { setRoutes(result.routes as Route[]); setCursor(result.cursor); }
    } catch { if (alive.current && request === generation.current) setError(true); }
  }, [uid, selected]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function loadMore() {
    if (!cursor || !selected || blocked || loadingMoreRef.current) return;
    const request = generation.current;
    loadingMoreRef.current = true; setLoadingMore(true); setError(false);
    try {
      const result = await readSharedRoutes(uid, selected, cursor);
      if (alive.current && request === generation.current) {
        setRoutes((existing) => [...existing, ...(result.routes as Route[]).filter((route) => !existing.some((item) => item.id === route.id))]);
        setCursor(result.cursor);
      }
    } catch {
      if (alive.current && request === generation.current) { setRoutes([]); setCursor(null); setError(true); }
    } finally {
      if (alive.current && request === generation.current) { loadingMoreRef.current = false; setLoadingMore(false); }
    }
  }
  const space = spaces.find((item) => item.id === selected);
  const canCreate = space && ["manager", "supervisor"].includes(space.role);
  function changePoints(update: (existing: RoutePoint[]) => RoutePoint[], announce = true) {
    routeRequestVersion.current += 1; routeRequest.current?.abort(); routeRequest.current = null;
    setRouting(false); setRoadPolyline(""); setRoutingMessage(announce && (roadPolyline || routing) ? "Points changed. Find roads again before saving." : ""); setPoints(update);
  }
  async function findRoadRoute() {
    if (blocked || pendingRef.current || routing || points.length < 2) return;
    if (Date.now() - lastRouteRequest.current < 1000) { setRoutingMessage("Wait a moment before trying again."); return; }
    lastRouteRequest.current = Date.now();
    const version = ++routeRequestVersion.current, controller = new AbortController();
    routeRequest.current = controller; setRouting(true); setRoadPolyline(""); setRoutingMessage("");
    try {
      const result = await followRoads(points, controller.signal);
      if (alive.current && version === routeRequestVersion.current) { setRoadPolyline(result.encoded); setRoutingMessage("Road route found. Review it, then save the route."); }
    } catch (failure) {
      if (alive.current && version === routeRequestVersion.current && !controller.signal.aborted) setRoutingMessage(failure instanceof Error && failure.name !== "TypeError" && failure.message ? failure.message : "Could not reach the road routing service. Check your connection and try again.");
    } finally { if (alive.current && version === routeRequestVersion.current) { setRouting(false); routeRequest.current = null; } }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || routing || !selected || !canCreate) return;
    if (!pendingRef.current && (points.length < 2 || points.every((point) => point.lat === points[0].lat && point.lng === points[0].lng))) { setMessage("Choose at least two different points on the map."); return; }
    if (!pendingRef.current && !roadPolyline) { setMessage(""); void findRoadRoute(); return; }
    const draft = pendingRef.current ?? { spaceId: selected, operationId: crypto.randomUUID(), name, start, destination, geometry: JSON.stringify(points), roadPolyline };
    pendingRef.current = draft; setPending(draft); setMessage(""); setDiscarding(false);
    void run(async () => {
      const result = await sharedAccessRequest(uid, "createRoute", draft);
      pendingRef.current = null; setPending(null); setName(""); setStart(""); setDestination(""); changePoints(() => [], false); setLatitude(""); setLongitude("");
      await refresh();
      if (alive.current) { setMessage("Shared route saved."); onCreated(draft.spaceId, result.routeId); }
    });
  }
  if (!spaces.length && !pending) return null;
  return <section className="mt-4 rounded-lg bg-card p-3 text-sm">
    <h4 className="font-semibold">Shared routes · local emulator</h4>
    <p className="mt-1 text-muted-foreground">Private to this learner’s space.</p>
    <label className="mt-3 block">Route learner<select className={`${field} mt-1`} value={selected} disabled={blocked || !!pending} onChange={(event) => { if (event.target.value === selected) return; if ((name || start || destination || points.length) && !window.confirm("Move the unfinished route to the selected learner’s space?")) return; generation.current += 1; setRoutes([]); setCursor(null); setSelected(event.target.value); setMessage(""); }}>{spaces.map((item) => <option key={item.id} value={item.id}>{item.learnerName} · {item.role}</option>)}</select></label>
    <div className="mt-3 flex items-center gap-2"><h5 className="font-semibold">Saved routes</h5><button type="button" className={button} disabled={blocked || !selected} onClick={() => void refresh()}>Refresh shared routes</button></div>
    {error && <p role="status">Could not load shared routes. Check access and refresh.</p>}
    {cursor && <p>More routes are available. Refresh to see changes made while browsing.</p>}
    {space && <ul aria-label="Shared routes" className="mt-2 space-y-2">{routes.map((route) => <li key={route.id}><SharedRouteCard route={route} /></li>)}</ul>}
    {cursor && <button type="button" className={`${button} mt-2`} disabled={blocked || loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading routes…" : "Load more saved routes"}</button>}
    {canCreate && <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <h5 className="font-semibold sm:col-span-2">Create a route</h5>
      <label className="sm:col-span-2">Route name<input ref={nameInput} className={`${field} mt-1`} value={name} maxLength={80} required disabled={blocked || !!pending} onChange={(event) => setName(event.target.value)} /></label>
      <div className="space-y-2 sm:col-span-2"><p className="text-muted-foreground">Click to add points. Use the mouse wheel or + / − to zoom.</p>{activePage && <RouteMap interactive points={points} path={roadPath} label="Route drawing map" onAddPoint={(point) => { if (!blocked && !pendingRef.current && points.length < 50) changePoints((existing) => [...existing, point]); }} />}<p className="text-xs text-muted-foreground">{roadPolyline ? "Suggested road route shown." : "Points connect in straight lines until roads are found."}</p><div className="flex flex-wrap items-center gap-2"><span>{points.length} / 50 points</span><button type="button" className={button} disabled={blocked || !!pending || !points.length} onClick={() => changePoints((existing) => existing.slice(0, -1))}>Undo point</button><button type="button" className={button} disabled={blocked || !!pending || !points.length} onClick={() => changePoints(() => [])}>Clear map</button><button type="button" className={button} disabled={blocked || !!pending || routing || points.length < 2} onClick={() => void findRoadRoute()}>{routing ? "Finding roads…" : "Follow roads"}</button></div><p className="text-xs text-muted-foreground">Finding roads or saving sends these points to the public OSRM demo. Use fictional places only. Review the result; it is not navigation.</p>{routingMessage && <p role="status" className="text-sm">{routingMessage}</p>}<details><summary className="cursor-pointer text-[#0C7A8D]">Enter coordinates instead</summary><div className="mt-2 flex flex-wrap items-end gap-2"><label>Latitude<input type="number" step="any" min="-85" max="85" className={`${field} mt-1`} value={latitude} disabled={blocked || !!pending} onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitude<input type="number" step="any" min="-180" max="180" className={`${field} mt-1`} value={longitude} disabled={blocked || !!pending} onChange={(event) => setLongitude(event.target.value)} /></label><button type="button" className={button} disabled={blocked || !!pending || points.length >= 50} onClick={() => { const lat = Number(latitude), lng = Number(longitude); if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -85 || lat > 85 || lng < -180 || lng > 180) { setMessage("Enter a valid latitude and longitude."); return; } changePoints((existing) => [...existing, { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) }]); setLatitude(""); setLongitude(""); setMessage(""); }}>Add point</button></div></details></div>
      <label>Start description<input className={`${field} mt-1`} value={start} maxLength={160} required disabled={blocked || !!pending} onChange={(event) => setStart(event.target.value)} /></label>
      <label>Destination description<input className={`${field} mt-1`} value={destination} maxLength={160} required disabled={blocked || !!pending} onChange={(event) => setDestination(event.target.value)} /></label>
      <div className="flex items-end"><button className={button} disabled={blocked || routing}>{pending ? "Retry same route save" : "Save shared route"}</button></div>
    </form>}
    {pending && <div className="mt-3 rounded border border-amber-400 p-3"><p>The route may already have saved. Refresh spaces and routes before retrying. Retry details last only while this page is open; review routes before re-entering after leaving.</p>{!discarding ? <button type="button" className={`${button} mt-2`} disabled={blocked} onClick={() => setDiscarding(true)}>Discard route retry details</button> : <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); if (!canCreate) setSelected(spaces[0]?.id ?? ""); }}>Confirm discard route retry</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep route retry details</button></div>}</div>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}

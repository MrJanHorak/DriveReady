import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { readSharedRoutes, sharedAccessRequest, sharedAccessDemo } from "./sharedClient";
import RouteMap, { type RoutePoint } from "./RouteMap";
import { decodeRoutePolyline } from "./routePolyline";
import { followRoads } from "./followRoads";
import { ChevronDown, Map as MapIcon, Navigation, Plus, RefreshCw } from "lucide-react";
import { Badge, Card, CardHeader, RouteSketch, ghostButton, heading, mono, primaryButton } from "./design";

type Space = { id: string; learnerName: string; role: string };
type Route = { id: string; name: string; start: string; destination: string; geometry?: RoutePoint[]; roadPolyline?: string };
type Draft = { spaceId: string; operationId: string; name: string; start: string; destination: string; geometry: string; roadPolyline: string };
const field = "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-normal outline-none transition-all focus:border-[#0C7A8D] focus:ring-2 focus:ring-[#0C7A8D]/15";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

export default function SharedRoutes({ uid, spaces, blocked, run, createRequest, onCreated, activePage }: { uid: string; spaces: Space[]; blocked: boolean; run: (action: () => Promise<void>) => Promise<void>; createRequest: { spaceId: string; nonce: string } | null; onCreated: (spaceId: string, routeId: string) => void; activePage: boolean }) {
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
  const createCard = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState("");
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
  const activeRoute = routes.find((route) => route.id === activeId) ?? routes[0];
  const activePath = useMemo(() => { try { return activeRoute?.roadPolyline ? decodeRoutePolyline(activeRoute.roadPolyline) : undefined; } catch { return undefined; } }, [activeRoute?.roadPolyline]);
  const activePoints = Array.isArray(activeRoute?.geometry) && activeRoute.geometry.length >= 2 ? activeRoute.geometry : null;
  if (!spaces.length && !pending) return null;
  return <section className="space-y-5 text-sm" aria-label={sharedAccessDemo ? "Shared routes · local emulator" : "Shared routes"}>
    <h4 className="sr-only">{sharedAccessDemo ? "Shared routes · local emulator" : "Shared routes"}</h4>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="flex w-full flex-col gap-1 sm:w-auto text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>Route learner
        <select className="w-full rounded-lg sm:w-auto sm:min-w-[240px] border border-border bg-card px-3 py-2 text-sm font-medium normal-case tracking-normal text-foreground" style={{ fontFamily: "'Inter', sans-serif" }} value={selected} disabled={blocked || !!pending} onChange={(event) => { if (event.target.value === selected) return; if ((name || start || destination || points.length) && !window.confirm("Move the unfinished route to the selected learner’s space?")) return; generation.current += 1; setRoutes([]); setCursor(null); setActiveId(""); setSelected(event.target.value); setMessage(""); }}>{spaces.map((item) => <option key={item.id} value={item.id}>{item.learnerName} · {item.role}</option>)}</select>
      </label>
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground" style={mono}>{routes.length}{cursor ? "+" : ""} {routes.length === 1 ? "route" : "routes"}</span><button type="button" className={ghostButton} disabled={blocked || !selected} onClick={() => void refresh()}><RefreshCw size={13} aria-hidden="true" /> Refresh shared routes</button>{canCreate && <button type="button" className={primaryButton} disabled={blocked || !!pending} onClick={() => { createCard.current?.scrollIntoView({ behavior: "smooth", block: "start" }); nameInput.current?.focus({ preventScroll: true }); }}><Plus size={15} aria-hidden="true" /> New route</button>}</div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card className="flex min-w-0 flex-col overflow-hidden">
        <CardHeader divided title="Saved routes" subtitle={`Private to ${space?.learnerName ?? "this learner"}’s space`} />
        {error && <p role="status" className="px-5 pt-4">Could not load shared routes. Check access and refresh.</p>}
        {cursor && <p className="px-5 pt-4 text-xs text-muted-foreground">More routes are available. Refresh to see changes made while browsing.</p>}
        {space && !routes.length && !error && <p className="p-5 text-muted-foreground">No saved routes yet.{canCreate ? " Draw one on the map below." : ""}</p>}
        {space && <ul aria-label="Shared routes" className="max-h-[520px] space-y-2 overflow-y-auto p-3">{routes.map((route) => {
          const isActive = route.id === activeRoute?.id;
          return <li key={route.id}><details className={`group rounded-xl border transition-all duration-150 ${isActive ? "border-[#0C7A8D]/40 bg-[#F4FAFB] shadow-[inset_3px_0_0_#0C7A8D]" : "border-border hover:border-[#0C7A8D]/25 hover:bg-muted/40"}`} onToggle={(event) => { if (event.currentTarget.open) setActiveId(route.id); }}>
            <summary className="flex cursor-pointer list-none items-start gap-3 p-3 [&::-webkit-details-marker]:hidden" onClick={() => setActiveId(route.id)}>
              <RouteSketch geometry={route.geometry} roadPolyline={route.roadPolyline} width={72} height={52} label={`${route.name} route shape`} />
              <span className="min-w-0 flex-1"><strong className="block break-words text-sm text-foreground" style={heading}>{route.name}</strong><span className="mt-0.5 block break-words text-xs text-muted-foreground">{route.start} → {route.destination}</span><span className="mt-1.5 inline-block rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground" style={mono}>{route.roadPolyline ? "Follows roads" : Array.isArray(route.geometry) ? "Drawn points" : "No map"}</span></span>
              <ChevronDown size={16} className="mt-1 flex-shrink-0 text-[#0C7A8D] transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-1.5 border-t border-border px-3 py-2.5 text-xs">
              <p><strong>Start:</strong> {route.start}</p><p><strong>Destination:</strong> {route.destination}</p>
              <p className="text-muted-foreground">{route.roadPolyline ? <>Suggested road route by <a className="underline" href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a>. Review before use; this is not turn-by-turn navigation.</> : Array.isArray(route.geometry) ? "Drawn route: lines connect the selected points; this is not turn-by-turn navigation." : "This older route has no map points."}</p>
            </div>
          </details></li>;
        })}</ul>}
        {cursor && <div className="px-3 pb-3"><button type="button" className={`${button} w-full`} disabled={blocked || loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading routes…" : "Load more saved routes"}</button></div>}
      </Card>

      <Card className="flex min-w-0 flex-col overflow-hidden" aria-label="Selected route">
        <CardHeader divided title={activeRoute ? activeRoute.name : "Route map"} subtitle={activeRoute ? `${activeRoute.start} → ${activeRoute.destination}` : "Select a saved route to see it here"} action={activeRoute?.roadPolyline ? <Badge>Follows roads</Badge> : undefined} />
        <div className="relative flex-1 p-3">
          {activePage && activePoints ? <RouteMap browse points={activePoints} path={activePath} heightClass="h-72 lg:h-[460px]" label={`${activeRoute!.name} on the map`} /> : <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl bg-[#E4EFF2] text-[#0C7A8D] lg:h-[460px]"><MapIcon size={28} aria-hidden="true" /><span className="text-xs">{activeRoute ? "This older route has no map points." : "No route selected"}</span></div>}
          {activePoints && <div className="pointer-events-none absolute bottom-6 left-6 z-[500] rounded-xl border border-border bg-card/95 px-3 py-2 text-[11px] shadow-sm" style={mono}><span className="mr-3 inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#138f69]" />Start</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#df8250]" />Destination</span></div>}
        </div>
      </Card>
    </div>

    {canCreate && <Card className="overflow-hidden" aria-label="Create a route"><div ref={createCard} className="scroll-mt-4" />
      <CardHeader divided title="Create a route" subtitle={`Saved to ${space?.learnerName ?? "this learner"}’s space. Points follow roads before saving.`} />
      <form className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]" onSubmit={submit}>
        <h5 className="sr-only">Create a route</h5>
        <div className="min-w-0 space-y-3"><p className="text-sm text-muted-foreground">Click the map to add points in driving order. Use the mouse wheel or + / − to zoom.</p>{activePage && <RouteMap interactive points={points} path={roadPath} label="Route drawing map" onAddPoint={(point) => { if (!blocked && !pendingRef.current && points.length < 50) changePoints((existing) => [...existing, point]); }} />}<p className="text-xs text-muted-foreground">{roadPolyline ? "Suggested road route shown." : "Points connect in straight lines until roads are found."}</p><div className="flex flex-wrap items-center gap-2"><span className="mr-1 rounded-md bg-[#E4EFF2] px-2 py-1 text-xs font-semibold text-[#0C7A8D]" style={mono}>{points.length} / 50 points</span><button type="button" className={button} disabled={blocked || !!pending || !points.length} onClick={() => changePoints((existing) => existing.slice(0, -1))}>Undo point</button><button type="button" className={button} disabled={blocked || !!pending || !points.length} onClick={() => changePoints(() => [])}>Clear map</button><button type="button" className={`${button} border-[#0C7A8D]/40 font-semibold text-[#0C7A8D]`} disabled={blocked || !!pending || routing || points.length < 2} onClick={() => void findRoadRoute()}><Navigation size={13} className="mr-1 inline" aria-hidden="true" />{routing ? "Finding roads…" : "Follow roads"}</button></div><p className="text-xs text-muted-foreground">Finding roads or saving sends these points to the public OSRM demo. Use fictional places only. Review the result; it is not navigation.</p>{routingMessage && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${roadPolyline ? "bg-[#E4EFF2] text-[#095969]" : "bg-amber-50 text-amber-900"}`}>{routingMessage}</p>}<details className="text-sm"><summary className="cursor-pointer text-[#0C7A8D]">Enter coordinates instead</summary><div className="mt-2 flex flex-wrap items-end gap-2"><label>Latitude<input type="number" step="any" min="-85" max="85" className={`${field} mt-1`} value={latitude} disabled={blocked || !!pending} onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitude<input type="number" step="any" min="-180" max="180" className={`${field} mt-1`} value={longitude} disabled={blocked || !!pending} onChange={(event) => setLongitude(event.target.value)} /></label><button type="button" className={button} disabled={blocked || !!pending || points.length >= 50} onClick={() => { const lat = Number(latitude), lng = Number(longitude); if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -85 || lat > 85 || lng < -180 || lng > 180) { setMessage("Enter a valid latitude and longitude."); return; } changePoints((existing) => [...existing, { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) }]); setLatitude(""); setLongitude(""); setMessage(""); }}>Add point</button></div></details></div>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">Route name<input ref={nameInput} className={`${field} mt-1`} value={name} maxLength={80} required disabled={blocked || !!pending} onChange={(event) => setName(event.target.value)} /></label>
          <label className="text-sm font-medium">Start description<input className={`${field} mt-1`} value={start} maxLength={160} required disabled={blocked || !!pending} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="text-sm font-medium">Destination description<input className={`${field} mt-1`} value={destination} maxLength={160} required disabled={blocked || !!pending} onChange={(event) => setDestination(event.target.value)} /></label>
          <ol className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            <li className={points.length >= 2 ? "text-[#0C7A8D]" : ""}>{points.length >= 2 ? "✓" : "1."} Add at least two points</li>
            <li className={roadPolyline ? "text-[#0C7A8D]" : ""}>{roadPolyline ? "✓" : "2."} Follow roads and review the line</li>
            <li>3. Name it and save</li>
          </ol>
          <button className={`${primaryButton} justify-center`} disabled={blocked || routing}>{pending ? "Retry same route save" : "Save shared route"}</button>
          {message && <p role="status" className="text-sm">{message}</p>}
        </div>
      </form>
    </Card>}
    {pending && <div className="mt-3 rounded border border-amber-400 p-3"><p>The route may already have saved. Refresh spaces and routes before retrying. Retry details last only while this page is open; review routes before re-entering after leaving.</p>{!discarding ? <button type="button" className={`${button} mt-2`} disabled={blocked} onClick={() => setDiscarding(true)}>Discard route retry details</button> : <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); if (!canCreate) setSelected(spaces[0]?.id ?? ""); }}>Confirm discard route retry</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep route retry details</button></div>}</div>}
    {!canCreate && message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}

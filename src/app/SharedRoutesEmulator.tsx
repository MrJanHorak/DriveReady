import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { readSharedRoutes, sharedAccessRequest } from "./sharedAccessEmulator";
import SharedRouteCard from "./SharedRouteCard";

type Space = { id: string; learnerName: string; role: string };
type Route = { id: string; name: string; start: string; destination: string };
type Draft = { spaceId: string; operationId: string; name: string; start: string; destination: string };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

export default function SharedRoutesEmulator({ uid, spaces, blocked, run }: { uid: string; spaces: Space[]; blocked: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [selected, setSelected] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [pending, setPending] = useState<Draft | null>(null);
  const pendingRef = useRef<Draft | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; }; }, []);
  useEffect(() => { setSelected((current) => spaces.some((space) => space.id === current) ? current : (pendingRef.current ? "" : spaces[0]?.id ?? "")); }, [spaces]);
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
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || !selected || !canCreate) return;
    const draft = pendingRef.current ?? { spaceId: selected, operationId: crypto.randomUUID(), name, start, destination };
    pendingRef.current = draft; setPending(draft); setMessage(""); setDiscarding(false);
    void run(async () => {
      await sharedAccessRequest(uid, "createRoute", draft);
      pendingRef.current = null; setPending(null); setName(""); setStart(""); setDestination("");
      await refresh();
      if (alive.current) setMessage("Shared route saved.");
    });
  }
  if (!spaces.length && !pending) return null;
  return <section className="mt-4 rounded-lg bg-card p-3 text-sm">
    <h4 className="font-semibold">Shared routes · local emulator</h4>
    <p className="mt-1 text-muted-foreground">Visible only to active members of this learner’s space. These are text descriptions, not mapped paths or navigation.</p>
    <label className="mt-3 block">Route learner<select className={`${field} mt-1`} value={selected} disabled={blocked || !!pending} onChange={(event) => { if (event.target.value === selected) return; generation.current += 1; setRoutes([]); setCursor(null); setSelected(event.target.value); setMessage(""); }}>{spaces.map((item) => <option key={item.id} value={item.id}>{item.learnerName} · {item.role}</option>)}</select></label>
    <div className="mt-3 flex items-center gap-2"><h5 className="font-semibold">Saved routes</h5><button type="button" className={button} disabled={blocked || !selected} onClick={() => void refresh()}>Refresh shared routes</button></div>
    {error && <p role="status">Could not load shared routes. Check access and refresh.</p>}
    {cursor && <p>More routes are available. Refresh to see changes made while browsing.</p>}
    {space && <ul aria-label="Shared routes" className="mt-2 space-y-2">{routes.map((route) => <li key={route.id}><SharedRouteCard route={route} /></li>)}</ul>}
    {cursor && <button type="button" className={`${button} mt-2`} disabled={blocked || loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading routes…" : "Load more saved routes"}</button>}
    {canCreate && <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={submit}>
      <label>Route name<input className={`${field} mt-1`} value={name} maxLength={80} required disabled={blocked || !!pending} onChange={(event) => setName(event.target.value)} /></label>
      <label>Start description<input className={`${field} mt-1`} value={start} maxLength={160} required disabled={blocked || !!pending} onChange={(event) => setStart(event.target.value)} /></label>
      <label>Destination description<input className={`${field} mt-1`} value={destination} maxLength={160} required disabled={blocked || !!pending} onChange={(event) => setDestination(event.target.value)} /></label>
      <div className="flex items-end"><button className={button} disabled={blocked}>{pending ? "Retry same route save" : "Save shared route"}</button></div>
    </form>}
    {pending && <div className="mt-3 rounded border border-amber-400 p-3"><p>The route may already have saved. Refresh spaces and routes before retrying. Retry details last only while this page is open; review routes before re-entering after leaving.</p>{!discarding ? <button type="button" className={`${button} mt-2`} disabled={blocked} onClick={() => setDiscarding(true)}>Discard route retry details</button> : <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); if (!canCreate) setSelected(spaces[0]?.id ?? ""); }}>Confirm discard route retry</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep route retry details</button></div>}</div>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}

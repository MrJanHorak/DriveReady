import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { readSharedDrives, readSharedRoutes, sharedAccessRequest } from "./sharedAccessEmulator";
import SharedRouteCard from "./SharedRouteCard";

type Space = { id: string; learnerName: string; role: string };
type Route = { id: string; name: string; start: string; destination: string };
type Drive = { id: string; date: string; minutes: number; nightMinutes: number; notes: string; recordedByUid: string; supervisorPresentUid: string; routeId?: string; routeSnapshot?: { name: string; start: string; destination: string } };
type Pending = { spaceId: string; operationId: string; date: string; minutes: string; nightMinutes: string; notes: string; supervisorPresentUid: string; routeId: string };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

export default function SharedPracticeEmulator({ uid, spaces, blocked, run }: { uid: string; spaces: Space[]; blocked: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [selected, setSelected] = useState("");
  const [drives, setDrives] = useState<Drive[]>([]);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [date, setDate] = useState("");
  const [minutes, setMinutes] = useState("");
  const [nightMinutes, setNightMinutes] = useState("0");
  const [notes, setNotes] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeId, setRouteId] = useState("");
  const routeIdRef = useRef(routeId);
  routeIdRef.current = routeId;
  const [routeError, setRouteError] = useState(false);
  const [routeCursor, setRouteCursor] = useState<DocumentSnapshot | null>(null);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const loadingRoutesRef = useRef(false);
  const [routeNotice, setRouteNotice] = useState("");
  const routeGeneration = useRef(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [message, setMessage] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const generation = useRef(0);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; generation.current += 1; routeGeneration.current += 1; }; }, []);
  useEffect(() => {
    setSelected((current) => spaces.some((space) => space.id === current) ? current : (pendingRef.current ? "" : spaces[0]?.id ?? ""));
  }, [spaces]);
  const refreshHistory = useCallback(async () => {
    const request = ++generation.current;
    setDrives([]); setCursor(null); setHistoryError(false); setHistoryLoaded(false); loadingMoreRef.current = false; setLoadingMore(false);
    if (!selected) return;
    try {
      const result = await readSharedDrives(uid, selected);
      if (active.current && request === generation.current) { setDrives(result.drives as Drive[]); setCursor(result.cursor); setHistoryLoaded(true); }
    } catch {
      if (active.current && request === generation.current) setHistoryError(true);
    }
  }, [uid, selected]);
  useEffect(() => { void refreshHistory(); }, [refreshHistory]);
  const refreshRoutes = useCallback(async () => {
    const request = ++routeGeneration.current;
    setRoutes([]); setRouteCursor(null); setRouteError(false); setRouteNotice(routeIdRef.current ? "Route selection cleared. Select a route again after refreshing." : ""); setRouteId(""); loadingRoutesRef.current = false; setLoadingRoutes(false);
    if (!selected) return;
    try {
      const result = await readSharedRoutes(uid, selected);
      if (active.current && request === routeGeneration.current) {
        setRoutes(result.routes as Route[]); setRouteCursor(result.cursor);
      }
    } catch { if (active.current && request === routeGeneration.current) { setRouteId(""); setRouteError(true); } }
  }, [uid, selected]);
  useEffect(() => { void refreshRoutes(); }, [refreshRoutes]);
  async function loadMoreRoutes() {
    if (!routeCursor || !selected || blocked || pending || loadingRoutesRef.current) return;
    const request = routeGeneration.current;
    loadingRoutesRef.current = true; setLoadingRoutes(true); setRouteError(false);
    try {
      const result = await readSharedRoutes(uid, selected, routeCursor);
      if (active.current && request === routeGeneration.current) {
        setRoutes((existing) => [...existing, ...(result.routes as Route[]).filter((route) => !existing.some((item) => item.id === route.id))]);
        setRouteCursor(result.cursor);
      }
    } catch {
      if (active.current && request === routeGeneration.current) { setRoutes([]); setRouteCursor(null); setRouteId(""); setRouteError(true); }
    } finally {
      if (active.current && request === routeGeneration.current) { loadingRoutesRef.current = false; setLoadingRoutes(false); }
    }
  }
  async function loadMoreHistory() {
    if (!cursor || !selected || blocked || loadingMoreRef.current) return;
    const request = generation.current;
    loadingMoreRef.current = true; setLoadingMore(true); setHistoryError(false);
    try {
      const result = await readSharedDrives(uid, selected, cursor);
      if (active.current && request === generation.current) {
        setDrives((existing) => [...existing, ...(result.drives as Drive[]).filter((drive) => !existing.some((item) => item.id === drive.id))]);
        setCursor(result.cursor);
      }
    } catch {
      if (active.current && request === generation.current) { setDrives([]); setCursor(null); setHistoryLoaded(false); setHistoryError(true); }
    } finally {
      if (active.current && request === generation.current) { loadingMoreRef.current = false; setLoadingMore(false); }
    }
  }
  const space = spaces.find((item) => item.id === selected);
  const canRecord = space && ["manager", "supervisor"].includes(space.role);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || !selected || !canRecord) return;
    const draft = pendingRef.current ?? { spaceId: selected, operationId: crypto.randomUUID(), date, minutes, nightMinutes, notes, supervisorPresentUid: uid, routeId };
    pendingRef.current = draft; setPending(draft); setMessage(""); setDiscarding(false);
    void run(async () => {
      await sharedAccessRequest(uid, "createDrive", draft);
      pendingRef.current = null; setPending(null); setDate(""); setMinutes(""); setNightMinutes("0"); setNotes(""); setRouteId("");
      await refreshHistory();
      if (active.current) setMessage("Practice drive saved.");
    });
  }
  if (!spaces.length && !pending) return null;
  return <section className="mt-4 rounded-lg bg-card p-3 text-sm">
    <h4 className="font-semibold">Shared practice · local emulator</h4>
    <p className="mt-1 text-muted-foreground">Test records are separate from existing drives. All active members of this learner’s space can see these notes.</p>
    <label className="mt-3 block">Practice learner<select className={`${field} mt-1`} value={selected} disabled={blocked || !!pending} onChange={(event) => { if (event.target.value === selected) return; generation.current += 1; routeGeneration.current += 1; setDrives([]); setCursor(null); setHistoryLoaded(false); setRoutes([]); setRouteCursor(null); setRouteId(""); setRouteNotice(""); setSelected(event.target.value); setMessage(""); }}>{spaces.map((item) => <option key={item.id} value={item.id}>{item.learnerName} · {item.role}</option>)}</select></label>
    <div className="mt-3 flex items-center gap-2"><h5 className="font-semibold">Shared practice history</h5><button type="button" className={button} disabled={blocked || !selected} onClick={() => void refreshHistory()}>Refresh practice history</button></div>
    {historyError && <p role="status">Could not load practice history. Check access and refresh.</p>}
    {historyLoaded && <p className="mt-2" aria-label="Shared practice totals">{cursor ? "Totals for loaded drives" : "Practice totals"}: {drives.reduce((total, drive) => total + drive.minutes, 0)} minutes, including {drives.reduce((total, drive) => total + drive.nightMinutes, 0)} at night. These totals describe practice time, not driving proficiency.</p>}
    {cursor && <p>More drives are available. Totals include only loaded drives. Refresh to pick up changes made while browsing.</p>}
    <ul aria-label="Shared practice history" className="mt-2 space-y-2">{drives.map((drive) => <li key={`${selected}-${drive.id}`} className="space-y-2 rounded border border-border p-3"><p>{drive.date} · {drive.minutes} minutes · {drive.nightMinutes} at night</p>{drive.routeSnapshot && <SharedRouteCard route={drive.routeSnapshot} recorded uid={uid} spaceId={selected} routeId={drive.routeId} />}<p>{drive.notes}</p><p className="text-muted-foreground">Recorded by account {drive.recordedByUid}; reported supervisor account {drive.supervisorPresentUid}.</p></li>)}</ul>
    {cursor && <button type="button" className={`${button} mt-2`} disabled={blocked || loadingMore} onClick={() => void loadMoreHistory()}>{loadingMore ? "Loading drives…" : "Load older drives"}</button>}
    {canRecord && <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={submit}>
      <p className="sm:col-span-2">For this test, you are recorded as the supervisor reported present. This is not independently verified.</p>
      <label>Practice date<input className={`${field} mt-1`} type="date" required value={date} disabled={blocked || !!pending} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Total minutes<input className={`${field} mt-1`} type="number" min="1" max="1440" step="1" required value={minutes} disabled={blocked || !!pending} onChange={(event) => setMinutes(event.target.value)} /></label>
      <label>Night minutes<input className={`${field} mt-1`} type="number" min="0" max={minutes || "0"} step="1" required value={nightMinutes} disabled={blocked || !!pending} onChange={(event) => setNightMinutes(event.target.value)} /></label>
      <div><label>Saved route (optional)<select className={`${field} mt-1`} value={routeId} disabled={blocked || !!pending} onChange={(event) => { setRouteId(event.target.value); setRouteNotice(""); }}><option value="">No saved route</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.name} · {route.start} → {route.destination}</option>)}</select></label><div className="mt-1 flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || !!pending} onClick={() => void refreshRoutes()}>Refresh routes for practice</button>{routeCursor && <button type="button" className={button} disabled={blocked || !!pending || loadingRoutes} onClick={() => void loadMoreRoutes()}>{loadingRoutes ? "Loading routes…" : "Load more routes for practice"}</button>}</div>{routeNotice && <p role="status">{routeNotice}</p>}{routeError && <p role="status">Could not load routes. Refresh before choosing one.</p>}</div>
      <label>Shared practice notes<textarea className={`${field} mt-1`} maxLength={1000} value={notes} disabled={blocked || !!pending} onChange={(event) => setNotes(event.target.value)} /></label>
      {pending && <p className="sm:col-span-2">The save may already have succeeded. Refresh spaces, review practice history, and retry this same save. The retry details remain available only while this page stays open; after leaving, review history before entering it again.</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={button} disabled={blocked}>{pending ? "Retry same practice save" : "Save shared practice"}</button>{pending && <button type="button" className={button} disabled={blocked} onClick={() => setDiscarding(true)}>Discard retry details</button>}</div>
      {discarding && <div className="rounded border border-amber-400 p-3 sm:col-span-2"><p>Discarding does not undo a drive that may already have saved. Review history before creating another entry.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); }}>Confirm discard</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep retry details</button></div></div>}
    </form>}
    {pending && !canRecord && <div className="mt-3 rounded border border-amber-400 p-3"><p>The pending save cannot be retried because this account no longer has supervisor access to its space. It may already have saved.</p>{!discarding ? <button type="button" className={`${button} mt-2`} disabled={blocked} onClick={() => setDiscarding(true)}>Discard retry details</button> : <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); setSelected(spaces[0]?.id ?? ""); }}>Confirm discard</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep retry details</button></div>}</div>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}

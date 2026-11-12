import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { readSharedDrives, readSharedRoutes, readSharedRoute, sharedAccessRequest } from "./sharedAccessEmulator";
import SharedRouteCard from "./SharedRouteCard";
import type { RoutePoint } from "./RouteMap";
import { PracticeChoices } from "./PracticeCoverage";
import { PRACTICE_CONDITIONS, PRACTICE_SKILLS } from "./practiceData";
import { SkillTag, heading, primaryButton } from "./design";

type Space = { id: string; learnerName: string; role: string };
type Route = { id: string; name: string; start: string; destination: string; geometry?: RoutePoint[] };
type Drive = { id: string; date: string; minutes: number; nightMinutes: number; notes: string; recordedByUid: string; lastEditedByUid?: string; supervisorPresentUid: string; revision?: number; routeId?: string; practicedSkills?: string[]; practicedConditions?: string[]; routeSnapshot?: { name: string; start: string; destination: string; geometry?: RoutePoint[]; roadPolyline?: string } };
type CreateBody = { spaceId: string; operationId: string; date: string; minutes: string; nightMinutes: string; notes: string; supervisorPresentUid: string; routeId: string; practicedSkills: string; practicedConditions: string };
type EditBody = { spaceId: string; driveId: string; operationId: string; expectedRevision: string; date: string; minutes: string; nightMinutes: string; notes: string; practicedSkills: string; practicedConditions: string };
type Pending = { action: "createDrive"; body: CreateBody } | { action: "editDrive"; body: EditBody };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const button = "rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50";

export default function SharedPracticeEmulator({ uid, spaces, blocked, run, createdRoute, logRequest, onCreateRoute }: { uid: string; spaces: Space[]; blocked: boolean; run: (action: () => Promise<void>) => Promise<void>; createdRoute: { spaceId: string; routeId: string; nonce: string } | null; logRequest?: { spaceId: string; nonce: string } | null; onCreateRoute: (spaceId: string) => void }) {
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
  const [skills, setSkills] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const handledLog = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const [scrollToForm, setScrollToForm] = useState(false);
  const [editing, setEditing] = useState<Drive | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  useEffect(() => { if (scrollToForm && formRef.current) { formRef.current.scrollIntoView({ block: "start", behavior: "smooth" }); setScrollToForm(false); } }, [scrollToForm, formOpen]);
  const dateInput = useRef<HTMLInputElement>(null);
  const routeSelect = useRef<HTMLSelectElement>(null);
  const handledRoute = useRef("");
  const [focusCreatedRoute, setFocusCreatedRoute] = useState(false);
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
  useEffect(() => { if (editing) dateInput.current?.focus(); }, [editing]);
  useEffect(() => { if (focusCreatedRoute && !blocked && !pending && !editing && routeSelect.current) { routeSelect.current.focus(); setFocusCreatedRoute(false); } }, [focusCreatedRoute, blocked, pending, editing]);
  useEffect(() => {
    setSelected((current) => spaces.some((space) => space.id === current) ? current : (pendingRef.current ? "" : spaces[0]?.id ?? ""));
  }, [spaces]);
  useEffect(() => {
    if (!selected || spaces.some((space) => space.id === selected)) return;
    generation.current += 1; routeGeneration.current += 1;
    setDrives([]); setCursor(null); setHistoryLoaded(false); setRoutes([]); setRouteCursor(null);
    if (!pendingRef.current) { setEditing(null); setFormOpen(false); setDate(""); setMinutes(""); setNightMinutes("0"); setNotes(""); setRouteId(""); }
  }, [spaces, selected]);
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
  useEffect(() => {
    if (!createdRoute || createdRoute.nonce === handledRoute.current || createdRoute.spaceId !== selected || pendingRef.current || editing) return;
    handledRoute.current = createdRoute.nonce;
    const request = ++routeGeneration.current;
    loadingRoutesRef.current = false; setLoadingRoutes(false);
    let cancelled = false;
    void readSharedRoute(uid, selected, createdRoute.routeId).then((route) => {
      if (cancelled || !active.current || request !== routeGeneration.current) return;
      if (!route) { setRouteError(true); return; }
      setRoutes((existing) => existing.some((item) => item.id === route.id) ? existing : [...existing, route as Route]);
      setRouteId(route.id); setRouteNotice("Route selected. Add the practice details below."); setRouteError(false);
      setFocusCreatedRoute(true);
    }).catch(() => { if (!cancelled && active.current && request === routeGeneration.current) setRouteError(true); });
    return () => { cancelled = true; };
  }, [createdRoute, uid, selected, editing]);
  // "Log a drive" on the dashboard opens the form here for the chosen learner.
  useEffect(() => {
    if (!logRequest || logRequest.nonce === handledLog.current || pendingRef.current || editing) return;
    handledLog.current = logRequest.nonce;
    const dirty = !!(date || minutes || notes || routeId || skills.length || conditions.length);
    if (logRequest.spaceId !== selected && !dirty && spaces.some((item) => item.id === logRequest.spaceId)) {
      generation.current += 1; routeGeneration.current += 1;
      setDrives([]); setCursor(null); setHistoryLoaded(false); setRoutes([]); setRouteCursor(null); resetForm(); setRouteNotice(""); setSelected(logRequest.spaceId); setMessage("");
    }
    setFormOpen(true); setScrollToForm(true);
  }, [logRequest]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const chosenRoute = routes.find((route) => route.id === routeId);
  function resetForm() { setEditing(null); setFormOpen(false); setDate(""); setMinutes(""); setNightMinutes("0"); setNotes(""); setRouteId(""); setSkills([]); setConditions([]); }
  function startEdit(drive: Drive) {
    if (blocked || pending || !canRecord) return;
    if ((date || minutes || notes || routeId || skills.length || conditions.length) && !window.confirm("Replace the current unsaved practice form?")) return;
    setEditing(drive); setFormOpen(true); setDate(drive.date); setMinutes(String(drive.minutes)); setNightMinutes(String(drive.nightMinutes)); setNotes(drive.notes); setSkills(drive.practicedSkills ?? []); setConditions(drive.practicedConditions ?? []); setMessage("");
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || !selected || !canRecord) return;
    const draft: Pending = pendingRef.current ?? (editing ? { action: "editDrive", body: { spaceId: selected, driveId: editing.id, operationId: crypto.randomUUID(), expectedRevision: String(editing.revision ?? 0), date, minutes, nightMinutes, notes, practicedSkills: JSON.stringify(skills), practicedConditions: JSON.stringify(conditions) } } : { action: "createDrive", body: { spaceId: selected, operationId: crypto.randomUUID(), date, minutes, nightMinutes, notes, supervisorPresentUid: uid, routeId, practicedSkills: JSON.stringify(skills), practicedConditions: JSON.stringify(conditions) } });
    pendingRef.current = draft; setPending(draft); setMessage(""); setDiscarding(false);
    void run(async () => {
      await sharedAccessRequest(uid, draft.action, draft.body);
      pendingRef.current = null; setPending(null); resetForm();
      await refreshHistory();
      if (active.current) setMessage(draft.action === "editDrive" ? "Practice changes saved." : "Practice drive saved.");
    });
  }
  if (!spaces.length && !pending) return null;
  return <section className="mt-4 rounded-lg bg-card p-3 text-sm">
    <h4 className="text-base font-bold" style={heading}>Shared practice · local emulator</h4>
    <p className="mt-1 text-muted-foreground">Practice notes are visible to everyone in this learner’s space.</p>
    <label className="mt-3 block">Practice learner<select className={`${field} mt-1`} value={selected} disabled={blocked || !!pending} onChange={(event) => { if (event.target.value === selected) return; if ((date || minutes || notes || routeId || skills.length || conditions.length) && !window.confirm("Discard the current unsaved practice form and switch learners?")) return; generation.current += 1; routeGeneration.current += 1; setDrives([]); setCursor(null); setHistoryLoaded(false); setRoutes([]); setRouteCursor(null); resetForm(); setRouteNotice(""); setSelected(event.target.value); setMessage(""); }}>{spaces.map((item) => <option key={item.id} value={item.id}>{item.learnerName} · {item.role}</option>)}</select></label>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><h5 className="font-semibold">Practice history</h5><div className="flex gap-2"><button type="button" className={button} disabled={blocked || !selected} onClick={() => void refreshHistory()}>Refresh practice history</button>{canRecord && !formOpen && <button type="button" className={primaryButton} disabled={blocked} onClick={() => setFormOpen(true)}>Log a drive</button>}</div></div>
    {canRecord && formOpen && <form ref={formRef} className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2" onSubmit={submit}>
      {editing ? <p className="font-semibold sm:col-span-2">Editing practice from {editing.date}. The recorded route and reported supervisor stay the same.</p> : <p className="sm:col-span-2">For this test, you are recorded as the supervisor reported present. This is not independently verified.</p>}
      {!editing && <div className="sm:col-span-2"><label>Choose a saved route<select ref={routeSelect} className={`${field} mt-1`} value={routeId} required disabled={blocked || !!pending} onChange={(event) => { setRouteId(event.target.value); setRouteNotice(""); }}><option value="">Select a mapped route</option>{routes.map((route) => <option key={route.id} value={route.id} disabled={!Array.isArray(route.geometry) || route.geometry.length < 2}>{route.name} · {route.start} → {route.destination}{!route.geometry ? " (no map)" : ""}</option>)}</select></label>{routes.some((route) => !Array.isArray(route.geometry) || route.geometry.length < 2) && <p className="mt-1 text-xs text-muted-foreground">Older text-only routes can be viewed under Routes. Draw a mapped route to log a new drive.</p>}<div className="mt-1 flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || !!pending} onClick={() => onCreateRoute(selected)}>Create a route</button><button type="button" className={button} disabled={blocked || !!pending} onClick={() => void refreshRoutes()}>Refresh routes for practice</button>{routeCursor && <button type="button" className={button} disabled={blocked || !!pending || loadingRoutes} onClick={() => void loadMoreRoutes()}>{loadingRoutes ? "Loading routes…" : "Load more routes for practice"}</button>}</div>{routeNotice && <p role="status">{routeNotice}</p>}{routeError && <p role="status">Could not load routes. Refresh before choosing one.</p>}</div>}
      {!editing && chosenRoute && <div className="sm:col-span-2"><SharedRouteCard route={chosenRoute} /></div>}
      <label>Practice date<input ref={dateInput} className={`${field} mt-1`} type="date" required value={date} disabled={blocked || !!pending} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Total minutes<input className={`${field} mt-1`} type="number" min="1" max="1440" step="1" required value={minutes} disabled={blocked || !!pending} onChange={(event) => setMinutes(event.target.value)} /></label>
      <label>Night minutes<input className={`${field} mt-1`} type="number" min="0" max={minutes || "0"} step="1" required value={nightMinutes} disabled={blocked || !!pending} onChange={(event) => setNightMinutes(event.target.value)} /></label>
      <PracticeChoices legend="Skills practised" choices={PRACTICE_SKILLS} selected={skills} onChange={setSkills} disabled={blocked || !!pending} />
      <PracticeChoices legend="Roads and conditions" choices={PRACTICE_CONDITIONS} selected={conditions} onChange={setConditions} disabled={blocked || !!pending} />
      <label className="sm:col-span-2">Shared practice notes<textarea className={`${field} mt-1`} maxLength={1000} value={notes} disabled={blocked || !!pending} onChange={(event) => setNotes(event.target.value)} /></label>
      {pending && <p className="sm:col-span-2">The save may already have succeeded. Refresh spaces, review practice history, and retry this same save. If someone changed the entry, discard the retry and reopen the latest entry to edit. Retry details remain only while this page stays open.</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={button} disabled={blocked}>{pending ? "Retry same practice save" : editing ? "Save practice changes" : "Save shared practice"}</button>{!pending && <button type="button" className={button} disabled={blocked} onClick={resetForm}>{editing ? "Cancel editing" : "Cancel"}</button>}{pending && <button type="button" className={button} disabled={blocked} onClick={() => setDiscarding(true)}>Discard retry details</button>}</div>
      {discarding && <div className="rounded border border-amber-400 p-3 sm:col-span-2"><p>Discarding does not undo a drive that may already have saved. Review history before creating another entry.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); }}>Confirm discard</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep retry details</button></div></div>}
    </form>}
    {historyError && <p role="status">Could not load practice history. Check access and refresh.</p>}
    {space && historyLoaded && <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Shared practice totals"><span className="sr-only">{cursor ? "Totals for loaded drives" : "Practice totals"}: {drives.reduce((total, drive) => total + drive.minutes, 0)} minutes, including {drives.reduce((total, drive) => total + drive.nightMinutes, 0)} at night.</span><div className="rounded-xl bg-[#E4EFF2] p-3"><span className="block text-xs text-muted-foreground">{cursor ? "Loaded practice" : "Total practice"}</span><strong className="text-xl text-[#0C7A8D]">{drives.reduce((total, drive) => total + drive.minutes, 0)} min</strong></div><div className="rounded-xl bg-[#E4EFF2] p-3"><span className="block text-xs text-muted-foreground">At night</span><strong className="text-xl text-[#0C7A8D]">{drives.reduce((total, drive) => total + drive.nightMinutes, 0)} min</strong></div></div>}
    {cursor && <p>More drives are available. Totals include only loaded drives. Refresh to pick up changes made while browsing.</p>}
    <ul aria-label="Shared practice history" className="mt-3 space-y-3">{space && drives.map((drive) => <li key={`${selected}-${drive.id}`} className="space-y-2 rounded-xl border border-border p-3"><p className="font-medium">{drive.date} · {drive.minutes} min <span className="text-muted-foreground">· {drive.nightMinutes} min at night</span></p>{drive.routeSnapshot && <SharedRouteCard route={drive.routeSnapshot} recorded uid={uid} spaceId={selected} routeId={drive.routeId} />}{(drive.practicedSkills?.length || drive.practicedConditions?.length) ? <div className="flex flex-wrap gap-1.5" aria-label="Practised">{[...(drive.practicedSkills ?? []), ...(drive.practicedConditions ?? [])].map((tag) => <SkillTag key={tag} label={tag} />)}</div> : null}{drive.notes && <p>{drive.notes}</p>}<details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Recording details</summary><p>Recorded by account {drive.recordedByUid}; reported supervisor account {drive.supervisorPresentUid}.{drive.lastEditedByUid && drive.lastEditedByUid !== drive.recordedByUid ? ` Last edited by account ${drive.lastEditedByUid}.` : ""}</p></details>{canRecord && (space.role === "manager" || drive.recordedByUid === uid) && <button type="button" className={button} disabled={blocked || !!pending} onClick={() => startEdit(drive)}>Edit practice</button>}</li>)}</ul>
    {cursor && <button type="button" className={`${button} mt-2`} disabled={blocked || loadingMore} onClick={() => void loadMoreHistory()}>{loadingMore ? "Loading drives…" : "Load older drives"}</button>}
    {pending && !canRecord && <div className="mt-3 rounded border border-amber-400 p-3"><p>The pending save cannot be retried because this account no longer has supervisor access to its space. It may already have saved.</p>{!discarding ? <button type="button" className={`${button} mt-2`} disabled={blocked} onClick={() => setDiscarding(true)}>Discard retry details</button> : <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); setSelected(spaces[0]?.id ?? ""); }}>Confirm discard</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep retry details</button></div>}</div>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}

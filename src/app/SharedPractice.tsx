import { useCallback, useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import type { DocumentSnapshot } from "firebase/firestore";
import { readSharedDrives, readSharedRoutes, readSharedRoute, sharedAccessRequest, sharedAccessDemo } from "./sharedClient";
import SharedRouteCard from "./SharedRouteCard";
import type { RoutePoint } from "./RouteMap";
import { PracticeChoices } from "./PracticeChoices";
import { PRACTICE_CONDITIONS, PRACTICE_SKILLS } from "./practiceData";
import { SkillTag, dangerButton, ghostButton, heading, mono, primaryButton } from "./design";
import { PILOT_AREA, nightMinutes as nightOverlap, sunTimes } from "./sunTimes";
import { formatDate, formatDuration } from "./SharedDashboard";
import DriveTimer, { type TimerDraft } from "./DriveTimer";
import PracticeLog from "./PracticeLog";
import { loadTimer, saveTimer } from "./timerState";
import { routeStatus } from "./routeStatus";

type Space = { id: string; learnerName: string; role: string };
type Route = { id: string; name: string; start: string; destination: string; geometry?: RoutePoint[]; status?: string };
type Drive = { id: string; date: string; minutes: number; nightMinutes: number; notes: string; learnerReflection?: string; recordedByUid: string; lastEditedByUid?: string; supervisorPresentUid: string; revision?: number; routeId?: string; practicedSkills?: string[]; practicedConditions?: string[]; routeSnapshot?: { name: string; start: string; destination: string; geometry?: RoutePoint[]; roadPolyline?: string } };
type CreateBody = { spaceId: string; operationId: string; date: string; minutes: string; nightMinutes: string; notes: string; supervisorPresentUid: string; routeId: string; practicedSkills: string; practicedConditions: string };
type EditBody = { spaceId: string; driveId: string; operationId: string; expectedRevision: string; date: string; minutes: string; nightMinutes: string; notes: string; practicedSkills: string; practicedConditions: string };
type Pending = { action: "createDrive"; body: CreateBody } | { action: "editDrive"; body: EditBody };
const field = "w-full rounded-xl border border-border bg-[#F0F5F8] px-3.5 py-2.5 text-sm font-normal outline-none transition-all focus:border-[#0C7A8D] focus:bg-card focus:ring-2 focus:ring-[#0C7A8D]/15 disabled:opacity-60";
const button = ghostButton;

export default function SharedPractice({ uid, spaces, blocked, run, createdRoute, logRequest, visible = true, routesVersion = 0, onCreateRoute }: { uid: string; spaces: Space[]; blocked: boolean; run: (action: () => Promise<void>) => Promise<void>; createdRoute: { spaceId: string; routeId: string; nonce: string } | null; logRequest?: { spaceId: string; nonce: string; draft?: TimerDraft } | null; visible?: boolean; routesVersion?: number; onCreateRoute: (spaceId: string) => void }) {
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
  // Optional local start time ("HH:MM"); with the date, minutes and place it gives a night-minutes suggestion.
  const [startTime, setStartTime] = useState("");
  const [nightTouched, setNightTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [reflectingId, setReflectingId] = useState("");
  const [reflectionText, setReflectionText] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const handledLog = useRef("");
  // Start time of the timed drive the form was filled from; that timer is cleared once the drive is saved.
  const timerSource = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [scrollToForm, setScrollToForm] = useState(false);
  const [editing, setEditing] = useState<Drive | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
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
  const routeCursorRef = useRef<DocumentSnapshot | null>(null);
  useEffect(() => { routeCursorRef.current = routeCursor; }, [routeCursor]);
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
  // Quietly pick up routes saved elsewhere (the Routes page, another member) when the
  // page is shown or a route is saved. Unlike refreshRoutes it keeps the current selection.
  const syncRoutes = useCallback(async () => {
    if (!selected || loadingRoutesRef.current) return;
    const request = routeGeneration.current;
    try {
      const result = await readSharedRoutes(uid, selected);
      if (!active.current || request !== routeGeneration.current) return;
      const fresh = result.routes as Route[];
      // With every route loaded, the fresh list is complete, so deleted routes drop out.
      // With more pages loaded, keep the extra routes and only add new ones.
      const complete = routeCursorRef.current === null;
      setRoutes((existing) => complete ? fresh : [...fresh, ...existing.filter((route) => !fresh.some((item) => item.id === route.id))]
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
      if (complete) {
        setRouteCursor(result.cursor);
        setRouteId((current) => {
          if (current && !fresh.some((route) => route.id === current)) { setRouteNotice("The selected route was deleted. Choose another route."); return ""; }
          return current;
        });
      } else setRouteCursor((current) => current ?? result.cursor);
      setRouteError(false);
    } catch { /* keep the current list; the manual refresh reports errors */ }
  }, [uid, selected]);
  const wasVisible = useRef(visible);
  useEffect(() => {
    const becameVisible = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (becameVisible) void syncRoutes();
  }, [visible, syncRoutes]);
  useEffect(() => { if (routesVersion > 0) void syncRoutes(); }, [routesVersion]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // "Log a drive" (or a timed drive) opens the form here for the chosen learner.
  function openLogForm(request: { spaceId: string; draft?: TimerDraft }) {
    if (pendingRef.current || editing) return;
    const dirty = !!(date || minutes || notes || routeId || skills.length || conditions.length);
    const switching = request.spaceId !== selected && spaces.some((item) => item.id === request.spaceId);
    if (switching) {
      if (dirty && !window.confirm("Move to the timed drive’s learner? The unsaved practice form will be cleared.")) return;
      generation.current += 1; routeGeneration.current += 1;
      setDrives([]); setCursor(null); setHistoryLoaded(false); setRoutes([]); setRouteCursor(null); resetForm(); setRouteNotice(""); setSelected(request.spaceId); setMessage("");
    }
    if (request.draft) {
      if (!switching && dirty && !window.confirm("Fill the practice form with the timed drive? Your unsaved date and minutes will be replaced.")) { setFormOpen(true); return; }
      const started = new Date(request.draft.startedAt);
      setDate(request.draft.date); setMinutes(String(request.draft.minutes)); setNightMinutes("0"); setNightTouched(false);
      setStartTime(`${String(started.getHours()).padStart(2, "0")}:${String(started.getMinutes()).padStart(2, "0")}`);
      timerSource.current = request.draft.startedAt;
      setMessage(`Filled in from the drive timer: ${request.draft.minutes} min${request.draft.capped ? " (the most a single drive can record)" : ""}. Check the night minutes, choose the route and skills, then save.`);
    }
    setFormOpen(true); setScrollToForm(true);
  }
  useEffect(() => {
    if (!logRequest || logRequest.nonce === handledLog.current || pendingRef.current || editing) return;
    handledLog.current = logRequest.nonce;
    openLogForm(logRequest);
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
  const isLearner = space?.role === "learner";
  function saveReflection(drive: Drive) {
    const text = reflectionText.trim();
    void run(async () => {
      await sharedAccessRequest(uid, "setReflection", { spaceId: selected, driveId: drive.id, reflection: text });
      if (!active.current) return;
      setDrives((existing) => existing.map((item) => item.id === drive.id ? { ...item, learnerReflection: text || undefined } : item));
      setReflectingId(""); setReflectionText("");
      setMessage(text ? "Reflection saved." : "Reflection removed.");
    });
  }
  const chosenRoute = routes.find((route) => route.id === routeId);
  // Night-minutes suggestion: minutes after sunset or before sunrise, at the route's
  // start point or the pilot area. Georgia DDS does not define "night", so it is only a suggestion.
  const suggestionPlace = (() => {
    const point = (editing?.routeSnapshot?.geometry ?? chosenRoute?.geometry)?.[0];
    return point && Number.isFinite(point.lat) && Number.isFinite(point.lng) ? { lat: point.lat, lng: point.lng, label: "the route’s start" } : PILOT_AREA;
  })();
  const nightSuggestion = (() => {
    const total = Number(minutes);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !Number.isInteger(total) || total < 1 || total > 1440) return null;
    const start = new Date(`${date}T${startTime}`).getTime();
    if (!Number.isFinite(start)) return null;
    const sun = sunTimes(new Date(`${date}T12:00`).getTime(), suggestionPlace.lat, suggestionPlace.lng);
    const time = (ms?: number) => (ms === undefined ? "" : new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    return { minutes: Math.min(total, nightOverlap(start, start + total * 60000, suggestionPlace.lat, suggestionPlace.lng)), sunrise: time(sun.sunrise), sunset: time(sun.sunset) };
  })();
  useEffect(() => {
    if (nightSuggestion && !nightTouched && !pending && String(nightSuggestion.minutes) !== nightMinutes) setNightMinutes(String(nightSuggestion.minutes));
  }, [nightSuggestion?.minutes, nightTouched, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  function resetForm() { timerSource.current = null; setStartTime(""); setNightTouched(false); setEditing(null); setFormOpen(false); setDate(""); setMinutes(""); setNightMinutes("0"); setNotes(""); setRouteId(""); setSkills([]); setConditions([]); }
  function startEdit(drive: Drive) {
    if (blocked || pending || !canRecord) return;
    if ((date || minutes || notes || routeId || skills.length || conditions.length) && !window.confirm("Replace the current unsaved practice form?")) return;
    setEditing(drive); setFormOpen(true); setStartTime(""); setNightTouched(true); setDate(drive.date); setMinutes(String(drive.minutes)); setNightMinutes(String(drive.nightMinutes)); setNotes(drive.notes); setSkills(drive.practicedSkills ?? []); setConditions(drive.practicedConditions ?? []); setMessage("");
  }
  function removeDrive(drive: Drive) {
    if (blocked || pendingRef.current || !window.confirm(`Delete the drive from ${formatDate(drive.date)} (${formatDuration(drive.minutes)})? It will be removed for everyone in this learner’s space and can’t be undone.`)) return;
    if (editing?.id === drive.id) resetForm();
    setMessage("");
    void run(async () => {
      await sharedAccessRequest(uid, "deleteDrive", { spaceId: selected, driveId: drive.id, expectedRevision: String(drive.revision ?? 0) });
      await refreshHistory();
      if (active.current) setMessage("Practice drive deleted.");
    });
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked || !selected || !canRecord) return;
    const draft: Pending = pendingRef.current ?? (editing ? { action: "editDrive", body: { spaceId: selected, driveId: editing.id, operationId: crypto.randomUUID(), expectedRevision: String(editing.revision ?? 0), date, minutes, nightMinutes, notes, practicedSkills: JSON.stringify(skills), practicedConditions: JSON.stringify(conditions) } } : { action: "createDrive", body: { spaceId: selected, operationId: crypto.randomUUID(), date, minutes, nightMinutes, notes, supervisorPresentUid: uid, routeId, practicedSkills: JSON.stringify(skills), practicedConditions: JSON.stringify(conditions) } });
    pendingRef.current = draft; setPending(draft); setMessage(""); setDiscarding(false);
    void run(async () => {
      await sharedAccessRequest(uid, draft.action, draft.body);
      if (draft.action === "createDrive" && timerSource.current !== null && loadTimer(uid)?.startedAt === timerSource.current) saveTimer(uid, null);
      pendingRef.current = null; setPending(null); resetForm();
      await refreshHistory();
      if (active.current) setMessage(draft.action === "editDrive" ? "Practice changes saved." : "Practice drive saved.");
    });
  }
  if (!spaces.length && !pending) return null;
  return <section className="text-sm" aria-label="Practice log">
    <h4 className="text-base font-bold" style={heading}>{sharedAccessDemo ? "Shared practice · local emulator" : "Shared practice"}</h4>
        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>Practice learner<select className={`${field} mt-1 max-w-sm text-sm normal-case tracking-normal text-foreground`} style={{ fontFamily: "'Inter', sans-serif" }} value={selected} disabled={blocked || !!pending} onChange={(event) => { if (event.target.value === selected) return; if ((date || minutes || notes || routeId || skills.length || conditions.length) && !window.confirm("Discard the current unsaved practice form and switch learners?")) return; generation.current += 1; routeGeneration.current += 1; setDrives([]); setCursor(null); setHistoryLoaded(false); setRoutes([]); setRouteCursor(null); resetForm(); setRouteNotice(""); setSelected(event.target.value); setMessage(""); }}>{spaces.map((item) => <option key={item.id} value={item.id}>{item.learnerName} · {item.role}</option>)}</select></label>
    <div className="mt-3"><DriveTimer uid={uid} spaces={spaces} spaceId={selected} blocked={blocked || !!pending} onLog={(spaceId, draft) => openLogForm({ spaceId, draft })} /></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><h5 className="text-base font-bold" style={heading}>Practice history</h5><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || !selected} onClick={() => void refreshHistory()}>Refresh practice history</button><button type="button" className={button} disabled={blocked || !selected} onClick={() => setLogOpen(true)}><Printer size={14} aria-hidden="true" /> Print log</button>{canRecord && !formOpen && <button type="button" className={primaryButton} disabled={blocked} onClick={() => setFormOpen(true)}>Log a drive</button>}</div></div>
    {canRecord && formOpen && <form ref={formRef} className="mt-4 grid scroll-mt-4 gap-4 rounded-2xl border border-[#0C7A8D]/25 bg-card p-5 shadow-sm sm:grid-cols-2" onSubmit={submit}>
      <h5 className="text-base font-bold sm:col-span-2" style={heading}>{editing ? "Edit practice" : "Log a drive"}{space ? ` · ${space.learnerName}` : ""}</h5>
      {editing ? <p className="font-semibold sm:col-span-2">Editing practice from {editing.date}. The recorded route and reported supervisor stay the same.</p> : <p className="text-xs text-muted-foreground sm:col-span-2">You are recorded as the supervisor present. This is self-reported, not independently verified.</p>}
      {!editing && <div className="sm:col-span-2"><label className="text-sm font-medium">Choose a saved route<select ref={routeSelect} className={`${field} mt-1`} value={routeId} required disabled={blocked || !!pending} onChange={(event) => { setRouteId(event.target.value); setRouteNotice(""); }}><option value="">Select a mapped route</option>{routes.map((route) => { const status = routeStatus(route); return <option key={route.id} value={route.id} disabled={!Array.isArray(route.geometry) || route.geometry.length < 2 || status !== "approved"}>{route.name} · {route.start} → {route.destination}{!route.geometry ? " (no map)" : status === "proposed" ? " (awaiting approval)" : status === "declined" ? " (not approved)" : ""}</option>; })}</select></label>{routes.some((route) => !Array.isArray(route.geometry) || route.geometry.length < 2) && <p className="mt-1 text-xs text-muted-foreground">Older text-only routes can be viewed under Routes. Draw a mapped route to log a new drive.</p>}<div className="mt-1 flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked || !!pending} onClick={() => onCreateRoute(selected)}>Create a route</button><button type="button" className={button} disabled={blocked || !!pending} onClick={() => void refreshRoutes()}>Refresh routes for practice</button>{routeCursor && <button type="button" className={button} disabled={blocked || !!pending || loadingRoutes} onClick={() => void loadMoreRoutes()}>{loadingRoutes ? "Loading routes…" : "Load more routes for practice"}</button>}</div>{routeNotice && <p role="status">{routeNotice}</p>}{routeError && <p role="status">Could not load routes. Refresh before choosing one.</p>}</div>}
      {!editing && chosenRoute && <div className="sm:col-span-2"><SharedRouteCard route={chosenRoute} /></div>}
      <label className="text-sm font-medium">Practice date<input ref={dateInput} className={`${field} mt-1`} type="date" required value={date} disabled={blocked || !!pending} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="text-sm font-medium">Start time <span className="font-normal text-muted-foreground">(optional)</span><input className={`${field} mt-1`} type="time" value={startTime} disabled={blocked || !!pending} onChange={(event) => setStartTime(event.target.value)} /></label>
      <label className="text-sm font-medium">Total minutes<input className={`${field} mt-1`} type="number" min="1" max="1440" step="1" required value={minutes} disabled={blocked || !!pending} onChange={(event) => setMinutes(event.target.value)} /></label>
      <div>
        <label className="text-sm font-medium">Night minutes<input className={`${field} mt-1`} type="number" min="0" max={minutes || "0"} step="1" required value={nightMinutes} disabled={blocked || !!pending} aria-describedby="night-help" onChange={(event) => { setNightMinutes(event.target.value); setNightTouched(true); }} /></label>
        <p id="night-help" className="mt-1 text-xs text-muted-foreground">
          {nightSuggestion
            ? <>Suggested <strong className="text-foreground">{nightSuggestion.minutes} min</strong> after sunset or before sunrise (sunset {nightSuggestion.sunset}, sunrise {nightSuggestion.sunrise} near {suggestionPlace.label}). Georgia DDS doesn’t define night; adjust if you count differently.{nightTouched && String(nightSuggestion.minutes) !== nightMinutes && <> <button type="button" className="text-[#0C7A8D] underline" disabled={blocked || !!pending} onClick={() => { setNightMinutes(String(nightSuggestion.minutes)); setNightTouched(false); }}>Use {nightSuggestion.minutes}</button></>}</>
            : "Add a start time to get a suggestion from sunset and sunrise."}
        </p>
      </div>
      <PracticeChoices legend="Skills practised" choices={PRACTICE_SKILLS} selected={skills} onChange={setSkills} disabled={blocked || !!pending} />
      <PracticeChoices legend="Roads and conditions" choices={PRACTICE_CONDITIONS} selected={conditions} onChange={setConditions} disabled={blocked || !!pending} />
      <label className="text-sm font-medium sm:col-span-2">Shared practice notes <span className="font-normal text-muted-foreground">(visible to everyone in this learner’s space)</span><textarea className={`${field} mt-1 min-h-20`} maxLength={1000} value={notes} disabled={blocked || !!pending} onChange={(event) => setNotes(event.target.value)} /></label>
      {pending && <p className="sm:col-span-2">The save may already have succeeded. Refresh spaces, review practice history, and retry this same save. If someone changed the entry, discard the retry and reopen the latest entry to edit. Retry details remain only while this page stays open.</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={primaryButton} disabled={blocked}>{pending ? "Retry same practice save" : editing ? "Save practice changes" : "Save shared practice"}</button>{!pending && <button type="button" className={button} disabled={blocked} onClick={resetForm}>{editing ? "Cancel editing" : "Cancel"}</button>}{pending && <button type="button" className={button} disabled={blocked} onClick={() => setDiscarding(true)}>Discard retry details</button>}</div>
      {discarding && <div className="rounded border border-amber-400 p-3 sm:col-span-2"><p>Discarding does not undo a drive that may already have saved. Review history before creating another entry.</p><div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); }}>Confirm discard</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep retry details</button></div></div>}
    </form>}
    {historyError && <p role="status">Could not load practice history. Check access and refresh.</p>}
    {space && historyLoaded && <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Shared practice totals"><span className="sr-only">{cursor ? "Totals for loaded drives" : "Practice totals"}: {drives.reduce((total, drive) => total + drive.minutes, 0)} minutes, including {drives.reduce((total, drive) => total + drive.nightMinutes, 0)} at night.</span><div className="rounded-xl bg-[#E4EFF2] p-3"><span className="block text-xs text-muted-foreground">{cursor ? "Loaded practice" : "Total practice"}</span><strong className="text-xl text-[#0C7A8D]">{drives.reduce((total, drive) => total + drive.minutes, 0)} min</strong></div><div className="rounded-xl bg-[#E4EFF2] p-3"><span className="block text-xs text-muted-foreground">At night</span><strong className="text-xl text-[#0C7A8D]">{drives.reduce((total, drive) => total + drive.nightMinutes, 0)} min</strong></div></div>}
    {cursor && <p>More drives are available. Totals include only loaded drives. Refresh to pick up changes made while browsing.</p>}
    <ul aria-label="Shared practice history" className="mt-3 space-y-3">{space && drives.map((drive) => <li key={`${selected}-${drive.id}`} className="space-y-2 rounded-2xl border border-border bg-card p-4"><p className="flex flex-wrap items-baseline gap-x-2"><strong className="text-sm" style={heading}>{formatDate(drive.date)}</strong><span className="text-xs text-muted-foreground" style={mono}>{formatDuration(drive.minutes)}{drive.nightMinutes > 0 && <span className="text-[#12B5C9]"> · {formatDuration(drive.nightMinutes)} night</span>}</span></p>{drive.routeSnapshot && <SharedRouteCard route={drive.routeSnapshot} recorded uid={uid} spaceId={selected} routeId={drive.routeId} />}{(drive.practicedSkills?.length || drive.practicedConditions?.length) ? <div className="flex flex-wrap gap-1.5" aria-label="Practised">{[...(drive.practicedSkills ?? []), ...(drive.practicedConditions ?? [])].map((tag) => <SkillTag key={tag} label={tag} />)}</div> : null}{drive.notes && <p>{drive.notes}</p>}{reflectingId === drive.id ? <form className="space-y-2 rounded-xl bg-[#F4FAFB] p-3" onSubmit={(event) => { event.preventDefault(); saveReflection(drive); }}><label className="block text-sm font-medium">Your reflection <span className="font-normal text-muted-foreground">(visible to everyone in this space)</span><textarea className={`${field} mt-1 min-h-20`} maxLength={1000} value={reflectionText} disabled={blocked} placeholder="What went well? What do you want to practise next time?" onChange={(event) => setReflectionText(event.target.value)} /></label><div className="flex flex-wrap gap-2"><button className={primaryButton} disabled={blocked}>Save reflection</button><button type="button" className={ghostButton} disabled={blocked} onClick={() => setReflectingId("")}>Cancel</button></div></form>
      : drive.learnerReflection ? <div className="rounded-xl border-l-4 border-[#12B5C9] bg-[#F4FAFB] p-3" aria-label="Learner reflection"><p className="text-[11px] font-semibold uppercase tracking-wider text-[#0C7A8D]" style={mono}>{isLearner ? "Your reflection" : `${space?.learnerName ?? "Learner"}’s reflection`}</p><p className="mt-1">{drive.learnerReflection}</p>{isLearner && <button type="button" className={`${ghostButton} mt-2`} disabled={blocked} onClick={() => { setReflectingId(drive.id); setReflectionText(drive.learnerReflection ?? ""); }}>Edit reflection</button>}</div>
      : isLearner ? <button type="button" className={ghostButton} disabled={blocked} onClick={() => { setReflectingId(drive.id); setReflectionText(""); }}>Add your reflection</button> : null}<details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Recording details</summary><p>Recorded by account {drive.recordedByUid}; reported supervisor account {drive.supervisorPresentUid}.{drive.lastEditedByUid && drive.lastEditedByUid !== drive.recordedByUid ? ` Last edited by account ${drive.lastEditedByUid}.` : ""}</p></details>{canRecord && (space.role === "manager" || drive.recordedByUid === uid) && <button type="button" className={button} disabled={blocked || !!pending} onClick={() => startEdit(drive)}>Edit practice</button>}{canRecord && (space.role === "manager" || drive.recordedByUid === uid) && <button type="button" className={`${dangerButton} ml-2`} disabled={blocked || !!pending} onClick={() => removeDrive(drive)}>Delete</button>}</li>)}</ul>
    {cursor && <button type="button" className={`${button} mt-2`} disabled={blocked || loadingMore} onClick={() => void loadMoreHistory()}>{loadingMore ? "Loading drives…" : "Load older drives"}</button>}
    {pending && !canRecord && <div className="mt-3 rounded border border-amber-400 p-3"><p>The pending save cannot be retried because this account no longer has supervisor access to its space. It may already have saved.</p>{!discarding ? <button type="button" className={`${button} mt-2`} disabled={blocked} onClick={() => setDiscarding(true)}>Discard retry details</button> : <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={blocked} onClick={() => { pendingRef.current = null; setPending(null); setDiscarding(false); setSelected(spaces[0]?.id ?? ""); }}>Confirm discard</button><button type="button" className={button} onClick={() => setDiscarding(false)}>Keep retry details</button></div>}</div>}
    {message && <p role="status" className="mt-2">{message}</p>}
    {logOpen && space && <PracticeLog uid={uid} spaceId={space.id} learnerName={space.learnerName} onClose={() => setLogOpen(false)} />}
  </section>;
}

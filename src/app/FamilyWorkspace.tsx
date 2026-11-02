import { useEffect, useRef, useState } from "react";
import { emptyFamily, formatMinutes, locationMapUrl, placeMapUrl, readFamily, routeMapUrl, STORAGE_KEY, summarizeDrives, validRouteUrl } from "./familyData";
import PracticeCoverage, { PracticeChoices } from "./PracticeCoverage";
import GettingStarted from "./GettingStarted";
import FamilyBackup from "./FamilyBackup";
import { db } from "./firebaseClient";
import { createCloudRecord, readCloudFamily, replaceCloudRecord } from "./cloudFamily";
import { PRACTICE_CONDITIONS, PRACTICE_SKILLS } from "./practiceData";

type Learner = { id: string; name: string };
type Location = { latitude: number; longitude: number; accuracy: number; recordedAt: string };
type PracticeRoute = { start: string; end: string; stops: string[] };
type Drive = { id: string; learnerId: string; date: string; minutes: number; nightMinutes: number; skills: string; notes: string; place?: string; routeUrl?: string; location?: Location | null; route?: PracticeRoute | null; practicedSkills?: string[]; practicedConditions?: string[] };
type Family = { version: number; learners: Learner[]; drives: Drive[] };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0C7A8D]/30";
const primary = "rounded-lg bg-[#0C7A8D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A6A7B]";
const secondary = "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted";
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function FamilyWorkspace({ showAll = false, cloudUid, onSavingChange }: { showAll?: boolean; cloudUid?: string; onSavingChange?: (saving: boolean) => void }) {
  const [initial] = useState(() => {
    if (cloudUid) return { data: emptyFamily() as Family, error: "" };
    try { return { data: readFamily(window.localStorage) as Family, error: "" }; }
    catch { return { data: emptyFamily() as Family, error: "Saved data could not be read. Your existing data has not been changed. Check your browser storage before continuing." }; }
  });
  const [family, setFamily] = useState<Family>(initial.data);
  const [cloudLoading, setCloudLoading] = useState(!!cloudUid);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [storageBlocked, setStorageBlocked] = useState(!!initial.error);
  const [error, setError] = useState(initial.error);
  const [selectedId, setSelectedId] = useState(initial.data.learners[0]?.id ?? "");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Drive | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(today());
  const [minutes, setMinutes] = useState("");
  const [nightMinutes, setNightMinutes] = useState("0");
  const [skills, setSkills] = useState("");
  const [practicedSkills, setPracticedSkills] = useState<string[]>([]);
  const [practicedConditions, setPracticedConditions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [place, setPlace] = useState("");
  const [routeUrl, setRouteUrl] = useState("");
  const [routeStart, setRouteStart] = useState("");
  const [routeEnd, setRouteEnd] = useState("");
  const [routeStops, setRouteStops] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  useEffect(() => () => { locationRequest.current += 1; }, []);
  const [formError, setFormError] = useState("");
  useEffect(() => {
    if (!cloudUid || !db) return;
    let active = true;
    readCloudFamily(db, cloudUid).then((data: Family) => {
      if (!active) return;
      setFamily(data); setSelectedId(data.learners[0]?.id ?? ""); setCloudLoading(false);
    }).catch(() => {
      if (!active) return;
      setError("Could not load cloud records. Check your connection and refresh; no local records were changed."); setStorageBlocked(true); setCloudLoading(false);
    });
    return () => { active = false; };
  }, [cloudUid]);

  function save(next: Family, restoring = false) {
    if (storageBlocked && !restoring) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setFamily(next);
      setStorageBlocked(false);
      setError("");
      return true;
    } catch {
      setError("Your changes could not be saved in this browser. Check browser storage and try again.");
      return false;
    }
  }
  function restore(next: Family) {
    if (!save(next, true)) return false;
    locationRequest.current += 1; setLocating(false); setAdding(false); setEditing(null);
    setSelectedId(next.learners[0]?.id ?? "");
    return true;
  }
  async function saveCloud(kind: "learners" | "drives", record: Learner | Drive, original?: Drive) {
    if (!db || !cloudUid || savingRef.current || cloudLoading || storageBlocked) return false;
    savingRef.current = true; setSaving(true); onSavingChange?.(true); setError("");
    try {
      if (original) await replaceCloudRecord(db, cloudUid, kind, original, record);
      else await createCloudRecord(db, cloudUid, kind, record);
      return true;
    } catch (failure) {
      const text = failure instanceof Error && failure.message.includes("changed on another device")
        ? `${failure.message} Copy anything you need from the form before refreshing.`
        : "Could not confirm the cloud save. It may have succeeded. Copy anything you need from the form, then refresh cloud records and check for the change before trying again.";
      setStorageBlocked(true); setError(text); return false;
    } finally { savingRef.current = false; setSaving(false); onSavingChange?.(false); }
  }
  async function addLearner(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const learner = { id: id(), name: trimmed };
    const next = { ...family, learners: [...family.learners, learner] };
    const saved = cloudUid ? await saveCloud("learners", learner) : save(next);
    if (saved) {
      if (cloudUid) setFamily(next);
      setSelectedId(learner.id); setName(""); setAdding(false); setEditing(null);
    }
  }
  function startDrive(drive?: Drive) {
    locationRequest.current += 1; setLocating(false); setLocationMessage("");
    setEditing(drive ?? null); setAdding(true); setFormError("");
    setDate(drive?.date ?? today()); setMinutes(drive ? String(drive.minutes) : "");
    setNightMinutes(drive ? String(drive.nightMinutes) : "0");
    setSkills(drive?.skills ?? ""); setNotes(drive?.notes ?? "");
    setPracticedSkills(drive?.practicedSkills ?? []); setPracticedConditions(drive?.practicedConditions ?? []);
    setPlace(drive?.place ?? ""); setRouteUrl(drive?.routeUrl ?? ""); setLocation(drive?.location ?? null);
    setRouteStart(drive?.route?.start ?? ""); setRouteEnd(drive?.route?.end ?? ""); setRouteStops(drive?.route?.stops.join("\n") ?? "");
  }
  function captureLocation() {
    if (!navigator.geolocation) { setLocationMessage("Location is unavailable in this browser. You can still enter a place or route link."); return; }
    const request = ++locationRequest.current;
    setLocating(true); setLocationMessage("");
    navigator.geolocation.getCurrentPosition((position) => {
      if (locationRequest.current !== request) return;
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, recordedAt: new Date(position.timestamp).toISOString() });
      setLocationMessage("Location captured. Save the drive to keep it."); setLocating(false);
    }, () => {
      if (locationRequest.current !== request) return;
      setLocationMessage("Could not get your location. Check browser permissions or enter a place or route link instead."); setLocating(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  async function saveDrive(event: React.FormEvent) {
    event.preventDefault();
    const total = Number(minutes), night = Number(nightMinutes);
    if (!selectedId || !date || !Number.isInteger(total) || total < 1 || !Number.isInteger(night) || night < 0 || night > total) {
      setFormError("Enter a date, a whole-number duration of at least one minute, and night minutes no greater than the total."); return;
    }
    if (!validRouteUrl(routeUrl)) { setFormError("Enter a complete HTTPS route link, or leave it blank."); return; }
    const start = routeStart.trim(), end = routeEnd.trim();
    const stops = routeStops.split("\n").map((stop) => stop.trim()).filter(Boolean);
    if ((start || end || stops.length) && (!start || !end)) { setFormError("Enter both a start and destination for the route, or clear the route fields."); return; }
    if (stops.length > 3) { setFormError("Enter up to three route stops, one per line."); return; }
    if (stops.some((stop) => stop.length > 200)) { setFormError("Each route stop must be 200 characters or fewer."); return; }
    const route = start && end ? { start, end, stops } : null;
    const drive: Drive = { ...editing, id: editing?.id ?? id(), learnerId: selectedId, date, minutes: total, nightMinutes: night, skills: skills.trim(), notes: notes.trim(), place: place.trim(), routeUrl: routeUrl.trim(), location, route, practicedSkills, practicedConditions };
    const drives = editing ? family.drives.map((item) => item.id === editing.id ? drive : item) : [...family.drives, drive];
    const next = { ...family, drives };
    const saved = cloudUid ? await saveCloud("drives", drive, editing ?? undefined) : save(next);
    if (saved) { if (cloudUid) setFamily(next); setAdding(false); setEditing(null); }
  }
  const learner = family.learners.find((item) => item.id === selectedId);
  const summary = summarizeDrives(family.drives, selectedId);
  const drives = family.drives.filter((item) => item.learnerId === selectedId).sort((a, b) => b.date.localeCompare(a.date));

  return <div className="space-y-5">
      <div className="rounded-xl border border-[#0C7A8D]/20 bg-[#E4EFF2] p-4 text-sm text-[#095969]">
        {cloudUid ? <><strong>Cloud account.</strong> Records save to the signed-in account after the server confirms them. Refresh to see changes from another device. Cloud setup is still in development.</> : <><strong>Saved on this device.</strong> Profiles, logs, and any locations stay in this browser, are not synced, and can be lost if its data is cleared. Avoid sensitive personal details.</>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!showAll && !cloudUid && <FamilyBackup family={family} canExport={!storageBlocked} onRestore={restore} />}
      {cloudLoading && <p role="status" className="text-sm text-muted-foreground">Loading cloud records…</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-xl font-bold">{showAll ? "Driving logs" : "Your family’s practice"}</h2><p className="mt-1 text-sm text-muted-foreground">A simple place to record practice and see how it adds up.</p></div>
        {family.learners.length > 0 && <label className="text-sm font-medium">Learner<select className={`${field} mt-1 min-w-48`} value={selectedId} onChange={(e) => { locationRequest.current += 1; setLocating(false); setSelectedId(e.target.value); setAdding(false); setEditing(null); }}>{family.learners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">{family.learners.length ? "Add another learner" : "Where to start"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{family.learners.length ? "Keep each learner’s practice separate." : "Add a learner, then record a practice drive. A first name or nickname is enough."}</p>
        <form onSubmit={addLearner} className="mt-3 flex flex-wrap gap-2"><label className="sr-only" htmlFor="learner-name">Learner name or nickname</label><input id="learner-name" className={`${field} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Learner name or nickname" maxLength={60} required /><button className={secondary} disabled={storageBlocked || cloudLoading || saving}>{saving ? "Saving…" : "Add learner"}</button></form>
      </section>
      {!showAll && <GettingStarted drives={family.drives} learnerId={selectedId || undefined} />}
      {learner && <>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Practice summary">
          {[ ["Total driving", summary.totalMinutes], ["Day driving", summary.dayMinutes], ["Night driving", summary.nightMinutes] ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold text-[#0C7A8D]">{formatMinutes(value as number)}</p></div>)}
        </section>
        <p className="text-xs text-muted-foreground">Based on {summary.count} recorded {summary.count === 1 ? "drive" : "drives"}. Hours alone do not determine licensing eligibility or driving readiness.</p>
        {!showAll && <PracticeCoverage drives={family.drives} learnerId={selectedId} />}
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{showAll ? "All drives" : "Recent drives"}</h3><p className="text-sm text-muted-foreground">Practice recorded for {learner.name}</p></div><button className={primary} onClick={() => startDrive()} disabled={storageBlocked || cloudLoading || saving}>Log a drive</button></div>
          {adding && <form onSubmit={saveDrive} className="mt-5 grid gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
            <h4 className="font-semibold sm:col-span-2">{editing ? "Edit drive" : "Log a drive"}</h4>
            <label className="text-sm font-medium">Date<input className={`${field} mt-1`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
            <label className="text-sm font-medium">Total duration (minutes)<input className={`${field} mt-1`} type="number" min="1" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} required /></label>
            <label className="text-sm font-medium">Minutes driven at night<input className={`${field} mt-1`} type="number" min="0" step="1" value={nightMinutes} onChange={(e) => setNightMinutes(e.target.value)} required /></label>
            <label className="text-sm font-medium">Other skills or conditions <span className="font-normal text-muted-foreground">(optional)</span><input className={`${field} mt-1`} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Anything else to remember" maxLength={200} /></label>
            <PracticeChoices legend="Skills practiced" choices={PRACTICE_SKILLS} selected={practicedSkills} onChange={setPracticedSkills} />
            <PracticeChoices legend="Roads and conditions experienced" choices={PRACTICE_CONDITIONS} selected={practicedConditions} onChange={setPracticedConditions} />
            <label className="text-sm font-medium">Where did you drive? <span className="font-normal text-muted-foreground">(optional)</span><input className={`${field} mt-1`} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Evans, GA or Washington Road" maxLength={200} />{place.trim() && <a className="mt-1 inline-block text-xs text-[#0C7A8D] underline" href={placeMapUrl(place)} target="_blank" rel="noopener noreferrer">Find this place on Google Maps</a>}</label>
            <label className="text-sm font-medium">Map or route link <span className="font-normal text-muted-foreground">(optional)</span><input className={`${field} mt-1`} type="url" value={routeUrl} onChange={(e) => setRouteUrl(e.target.value)} placeholder="https://..." maxLength={2048} /></label>
            <div className="space-y-3 rounded-lg border border-border bg-background p-3 sm:col-span-2"><div><p className="text-sm font-medium">Describe the route <span className="font-normal text-muted-foreground">(optional)</span></p><p className="mt-1 text-xs text-muted-foreground">Enter places you visited, including a city and state. The map will suggest a route through them; check it matches your drive. For a loop, use the same start and destination and add a stop.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Start<input className={`${field} mt-1`} value={routeStart} onChange={(e) => setRouteStart(e.target.value)} placeholder="e.g. Evans, GA" maxLength={200} /></label><label className="text-sm font-medium">Destination<input className={`${field} mt-1`} value={routeEnd} onChange={(e) => setRouteEnd(e.target.value)} placeholder="e.g. Augusta Mall, GA" maxLength={200} /></label></div><label className="block text-sm font-medium">Stops along the way <span className="font-normal text-muted-foreground">(up to 3, one per line)</span><textarea className={`${field} mt-1`} value={routeStops} onChange={(e) => setRouteStops(e.target.value)} rows={2} maxLength={600} placeholder="e.g. Evans Town Center Park, GA" /></label>{routeStart.trim() && routeEnd.trim() && routeStops.split("\n").filter((stop) => stop.trim()).length <= 3 && <a className="inline-block text-sm text-[#0C7A8D] underline" href={routeMapUrl({ start: routeStart.trim(), end: routeEnd.trim(), stops: routeStops.split("\n").map((stop) => stop.trim()).filter(Boolean) })} target="_blank" rel="noopener noreferrer">Preview route in Google Maps</a>}</div>
            <div className="space-y-2 rounded-lg border border-border bg-background p-3 sm:col-span-2"><p className="text-sm font-medium">Pin a location <span className="font-normal text-muted-foreground">(optional)</span></p><p className="text-xs text-muted-foreground">Capture your current position, such as the start of a drive. This is one point, not a recording of the route. Your browser will request permission; location may be approximate. Use this only while safely stopped.</p><div className="flex flex-wrap items-center gap-2"><button type="button" className={secondary} onClick={captureLocation} disabled={locating}>{locating ? "Finding location…" : location ? "Update current location" : "Use current location"}</button>{location && <><span className="text-xs text-muted-foreground">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · accuracy ±{Math.ceil(location.accuracy)} m</span><button type="button" className={secondary} onClick={() => { locationRequest.current += 1; setLocating(false); setLocation(null); setLocationMessage(""); }}>Remove pin</button></>}</div>{locationMessage && <p role="status" className="text-xs text-muted-foreground">{locationMessage}</p>}</div>
            <label className="text-sm font-medium sm:col-span-2">Notes <span className="font-normal text-muted-foreground">(optional)</span><textarea className={`${field} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} /></label>
            {formError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{formError}</p>}
            <div className="flex gap-2 sm:col-span-2"><button className={primary} disabled={locating || saving || storageBlocked}>{saving ? "Saving…" : "Save drive"}</button><button type="button" className={secondary} disabled={saving} onClick={() => { locationRequest.current += 1; setLocating(false); setAdding(false); setEditing(null); }}>Cancel</button></div>
          </form>}
          {drives.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No drives logged yet. Start with your next practice session.</p> : <div className="mt-4 divide-y divide-border">{(showAll ? drives : drives.slice(0, 5)).map((drive) => <article key={drive.id} className="flex flex-wrap items-start justify-between gap-3 py-4"><div><p className="font-medium">{drive.date} · {formatMinutes(drive.minutes)} <span className="text-sm font-normal text-muted-foreground">({formatMinutes(drive.nightMinutes)} at night)</span></p>{drive.place && <p className="mt-1 text-sm">Location: <a className="text-[#0C7A8D] underline" href={placeMapUrl(drive.place)} target="_blank" rel="noopener noreferrer">{drive.place}</a></p>}{drive.route && <p className="mt-1 text-sm">Route: {drive.route.start} → {drive.route.stops.length ? `${drive.route.stops.join(" → ")} → ` : ""}{drive.route.end} · <a className="text-[#0C7A8D] underline" href={routeMapUrl(drive.route)} target="_blank" rel="noopener noreferrer">View suggested route</a></p>}{drive.routeUrl && validRouteUrl(drive.routeUrl) && <p className="mt-1 text-sm"><a className="text-[#0C7A8D] underline" href={drive.routeUrl} target="_blank" rel="noopener noreferrer">Open saved map or route link</a></p>}{drive.location && <p className="mt-1 text-sm"><a className="text-[#0C7A8D] underline" href={locationMapUrl(drive.location)} target="_blank" rel="noopener noreferrer">View captured location on Google Maps</a> <span className="text-xs text-muted-foreground">(±{Math.ceil(drive.location.accuracy)} m; captured {new Date(drive.location.recordedAt).toLocaleString()})</span></p>}{drive.skills && <p className="mt-1 text-sm">{drive.skills}</p>}{drive.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{drive.notes}</p>}{(drive.practicedSkills?.length || drive.practicedConditions?.length) ? <p className="mt-1 text-sm text-muted-foreground">Recorded: {[...(drive.practicedSkills ?? []), ...(drive.practicedConditions ?? [])].join(", ")}</p> : null}</div><button className={secondary} onClick={() => startDrive(drive)}>Edit</button></article>)}</div>}
        </section>
      </>}
  </div>;
}

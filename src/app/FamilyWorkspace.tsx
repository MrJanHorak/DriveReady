import { useState } from "react";
import { emptyFamily, formatMinutes, readFamily, STORAGE_KEY, summarizeDrives } from "./familyData";

type Learner = { id: string; name: string };
type Drive = { id: string; learnerId: string; date: string; minutes: number; nightMinutes: number; skills: string; notes: string };
type Family = { version: number; learners: Learner[]; drives: Drive[] };
const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0C7A8D]/30";
const primary = "rounded-lg bg-[#0C7A8D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A6A7B]";
const secondary = "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted";
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function FamilyWorkspace({ showAll = false }: { showAll?: boolean }) {
  const [initial] = useState(() => {
    try { return { data: readFamily(window.localStorage) as Family, error: "" }; }
    catch { return { data: emptyFamily() as Family, error: "Saved data could not be read. Your existing data has not been changed. Check your browser storage before continuing." }; }
  });
  const [family, setFamily] = useState<Family>(initial.data);
  const [error, setError] = useState(initial.error);
  const [selectedId, setSelectedId] = useState(initial.data.learners[0]?.id ?? "");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Drive | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(today());
  const [minutes, setMinutes] = useState("");
  const [nightMinutes, setNightMinutes] = useState("0");
  const [skills, setSkills] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  function save(next: Family) {
    if (initial.error) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setFamily(next);
      setError("");
      return true;
    } catch {
      setError("Your changes could not be saved in this browser. Check browser storage and try again.");
      return false;
    }
  }
  function addLearner(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const learner = { id: id(), name: trimmed };
    if (save({ ...family, learners: [...family.learners, learner] })) {
      setSelectedId(learner.id); setName(""); setAdding(false); setEditing(null);
    }
  }
  function startDrive(drive?: Drive) {
    setEditing(drive ?? null); setAdding(true); setFormError("");
    setDate(drive?.date ?? today()); setMinutes(drive ? String(drive.minutes) : "");
    setNightMinutes(drive ? String(drive.nightMinutes) : "0");
    setSkills(drive?.skills ?? ""); setNotes(drive?.notes ?? "");
  }
  function saveDrive(event: React.FormEvent) {
    event.preventDefault();
    const total = Number(minutes), night = Number(nightMinutes);
    if (!selectedId || !date || !Number.isInteger(total) || total < 1 || !Number.isInteger(night) || night < 0 || night > total) {
      setFormError("Enter a date, a whole-number duration of at least one minute, and night minutes no greater than the total."); return;
    }
    const drive: Drive = { id: editing?.id ?? id(), learnerId: selectedId, date, minutes: total, nightMinutes: night, skills: skills.trim(), notes: notes.trim() };
    const drives = editing ? family.drives.map((item) => item.id === editing.id ? drive : item) : [...family.drives, drive];
    if (save({ ...family, drives })) { setAdding(false); setEditing(null); }
  }
  const learner = family.learners.find((item) => item.id === selectedId);
  const summary = summarizeDrives(family.drives, selectedId);
  const drives = family.drives.filter((item) => item.learnerId === selectedId).sort((a, b) => b.date.localeCompare(a.date));

  return <main className="flex-1 overflow-auto p-5 md:p-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-xl border border-[#0C7A8D]/20 bg-[#E4EFF2] p-4 text-sm text-[#095969]">
        <strong>Saved on this device.</strong> Profiles and logs stay in this browser, are not synced, and can be lost if its data is cleared. Avoid sensitive personal details.
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-xl font-bold">{showAll ? "Driving logs" : "Your family’s practice"}</h2><p className="mt-1 text-sm text-muted-foreground">A simple place to record practice and see how it adds up.</p></div>
        {family.learners.length > 0 && <label className="text-sm font-medium">Learner<select className={`${field} mt-1 min-w-48`} value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setAdding(false); setEditing(null); }}>{family.learners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">{family.learners.length ? "Add another learner" : "Where to start"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{family.learners.length ? "Keep each learner’s practice separate." : "Add a learner, then record a practice drive. A first name or nickname is enough."}</p>
        <form onSubmit={addLearner} className="mt-3 flex flex-wrap gap-2"><label className="sr-only" htmlFor="learner-name">Learner name or nickname</label><input id="learner-name" className={`${field} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Learner name or nickname" maxLength={60} required /><button className={secondary} disabled={!!initial.error}>Add learner</button></form>
      </section>
      {learner && <>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Practice summary">
          {[ ["Total driving", summary.totalMinutes], ["Day driving", summary.dayMinutes], ["Night driving", summary.nightMinutes] ].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold text-[#0C7A8D]">{formatMinutes(value as number)}</p></div>)}
        </section>
        <p className="text-xs text-muted-foreground">Based on {summary.count} recorded {summary.count === 1 ? "drive" : "drives"}. Hours alone do not determine licensing eligibility or driving readiness.</p>
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{showAll ? "All drives" : "Recent drives"}</h3><p className="text-sm text-muted-foreground">Practice recorded for {learner.name}</p></div><button className={primary} onClick={() => startDrive()} disabled={!!initial.error}>Log a drive</button></div>
          {adding && <form onSubmit={saveDrive} className="mt-5 grid gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
            <h4 className="font-semibold sm:col-span-2">{editing ? "Edit drive" : "Log a drive"}</h4>
            <label className="text-sm font-medium">Date<input className={`${field} mt-1`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
            <label className="text-sm font-medium">Total duration (minutes)<input className={`${field} mt-1`} type="number" min="1" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} required /></label>
            <label className="text-sm font-medium">Minutes driven at night<input className={`${field} mt-1`} type="number" min="0" step="1" value={nightMinutes} onChange={(e) => setNightMinutes(e.target.value)} required /></label>
            <label className="text-sm font-medium">Skills or conditions practiced <span className="font-normal text-muted-foreground">(optional)</span><input className={`${field} mt-1`} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. parking, rain" maxLength={200} /></label>
            <label className="text-sm font-medium sm:col-span-2">Notes <span className="font-normal text-muted-foreground">(optional)</span><textarea className={`${field} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} /></label>
            {formError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{formError}</p>}
            <div className="flex gap-2 sm:col-span-2"><button className={primary}>Save drive</button><button type="button" className={secondary} onClick={() => { setAdding(false); setEditing(null); }}>Cancel</button></div>
          </form>}
          {drives.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No drives logged yet. Start with your next practice session.</p> : <div className="mt-4 divide-y divide-border">{(showAll ? drives : drives.slice(0, 5)).map((drive) => <article key={drive.id} className="flex flex-wrap items-start justify-between gap-3 py-4"><div><p className="font-medium">{drive.date} · {formatMinutes(drive.minutes)} <span className="text-sm font-normal text-muted-foreground">({formatMinutes(drive.nightMinutes)} at night)</span></p>{drive.skills && <p className="mt-1 text-sm">{drive.skills}</p>}{drive.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{drive.notes}</p>}</div><button className={secondary} onClick={() => startDrive(drive)}>Edit</button></article>)}</div>}
        </section>
      </>}
    </div>
  </main>;
}

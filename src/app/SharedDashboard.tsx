import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Clock, Map, Plus, Route as RouteIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { readSharedDrives, readSharedRoutes } from "./sharedClient";
import { PRACTICE_CONDITIONS, PRACTICE_SKILLS } from "./practiceData";
import type { RoutePoint } from "./RouteMap";
import { Badge, Card, CardHeader, ProgressBar, ProgressRing, RouteSketch, SkillTag, ghostButton, heading, mono, primaryButton } from "./design";

type Space = { id: string; learnerName: string; role: string };
type Drive = { id: string; date: string; minutes: number; nightMinutes: number; routeId?: string; routeSnapshot?: { name: string }; practicedSkills?: string[]; practicedConditions?: string[] };
type Route = { id: string; name: string; start: string; destination: string; geometry?: RoutePoint[]; roadPolyline?: string };

// Georgia DDS describes 40 supervised hours, including 6 at night (see State Requirements).
const TARGET_HOURS = 40, TARGET_NIGHT_HOURS = 6;
const MAX_PAGES = 20;

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
const roleLabel: Record<string, string> = { manager: "Managing supervisor", supervisor: "Supervisor", learner: "Learner" };
export function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

// Mounted only while the dashboard is visible, so each visit shows fresh totals.
export default function SharedDashboard({ uid, spaces, blocked, onNavigate, onLogDrive, preferredSpace, onSelect }: { uid: string; spaces: Space[]; blocked: boolean; onNavigate: (page: string) => void; onLogDrive: (spaceId: string) => void; preferredSpace: string; onSelect: (spaceId: string) => void }) {
  const [selected, setSelectedState] = useState(preferredSpace);
  const setSelected = useCallback((next: string | ((current: string) => string)) => setSelectedState((current) => { const value = typeof next === "function" ? next(current) : next; if (value !== current) onSelect(value); return value; }), [onSelect]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [partial, setPartial] = useState(false);
  const generation = useRef(0);
  useEffect(() => { setSelected((current) => spaces.some((space) => space.id === current) ? current : spaces[0]?.id ?? ""); }, [spaces, setSelected]);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setDrives([]); setRoutes([]); setPartial(false);
    if (!selected) { setState("idle"); return; }
    setState("loading");
    try {
      const all: Drive[] = [];
      // The reader returns an opaque Firestore cursor for the next page.
      let cursor: Parameters<typeof readSharedDrives>[2] = null, pages = 0;
      do {
        const result = await readSharedDrives(uid, selected, cursor);
        all.push(...(result.drives as Drive[]));
        cursor = result.cursor as typeof cursor; pages += 1;
      } while (cursor && pages < MAX_PAGES && request === generation.current);
      const routePage = await readSharedRoutes(uid, selected);
      if (request !== generation.current) return;
      setDrives(all); setPartial(!!cursor); setRoutes(routePage.routes as Route[]); setState("ready");
    } catch {
      if (request === generation.current) setState("error");
    }
  }, [uid, selected]);
  useEffect(() => { void load(); return () => { generation.current += 1; }; }, [load]);

  const space = spaces.find((item) => item.id === selected);
  const canRecord = !!space && ["manager", "supervisor"].includes(space.role);
  const totals = useMemo(() => {
    const minutes = drives.reduce((sum, drive) => sum + drive.minutes, 0);
    const night = drives.reduce((sum, drive) => sum + drive.nightMinutes, 0);
    return { total: hours(minutes), night: hours(night), day: hours(minutes - night) };
  }, [drives]);
  const coverage = useMemo(() => {
    const count = (field: "practicedSkills" | "practicedConditions", label: string) => drives.filter((drive) => Array.isArray(drive[field]) && drive[field]!.includes(label)).length;
    return { skills: PRACTICE_SKILLS.map((label) => ({ label, count: count("practicedSkills", label) })), conditions: PRACTICE_CONDITIONS.map((label) => ({ label, count: count("practicedConditions", label) })) };
  }, [drives]);
  const routeUse = useMemo(() => {
    const use: Record<string, { count: number; last: string }> = {};
    for (const drive of drives) if (drive.routeId) {
      const entry = use[drive.routeId] ??= { count: 0, last: "" };
      entry.count += 1; if (drive.date > entry.last) entry.last = drive.date;
    }
    return use;
  }, [drives]);
  const nextSkill = coverage.skills.find((item) => item.count === 0)?.label;
  const hoursLeft = Math.max(TARGET_HOURS - totals.total, 0);

  if (!spaces.length) return null;
  return <div className="space-y-5" aria-label="Practice dashboard">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative">
        <button type="button" aria-haspopup="listbox" aria-expanded={menuOpen} aria-label={`Learner: ${space?.learnerName ?? "none"}. Change learner`} disabled={blocked} onClick={() => setMenuOpen((open) => !open)} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] text-[10px] font-bold text-white" aria-hidden="true">{initials(space?.learnerName ?? "")}</span>
          <span className="font-medium text-foreground">{space?.learnerName}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{space ? roleLabel[space.role] ?? space.role : ""}</span>
          <ChevronDown size={13} className="text-muted-foreground" aria-hidden="true" />
        </button>
        {menuOpen && <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <ul role="listbox" aria-label="Choose a learner" className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-xl border border-border bg-card py-1.5 shadow-lg">
            {spaces.map((item) => <li key={item.id} role="option" aria-selected={item.id === selected}>
              <button type="button" className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors hover:bg-muted ${item.id === selected ? "font-semibold text-[#0C7A8D]" : "text-foreground"}`} onClick={() => { setSelected(item.id); setMenuOpen(false); }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] text-[10px] font-bold text-white" aria-hidden="true">{initials(item.learnerName)}</span>
                <span className="flex-1">{item.learnerName}</span><span className="text-xs font-normal text-muted-foreground">{roleLabel[item.role] ?? item.role}</span>
              </button>
            </li>)}
          </ul>
        </>}
      </div>
      {canRecord && <button type="button" className={primaryButton} disabled={blocked} onClick={() => onLogDrive(selected)}><Plus size={15} aria-hidden="true" /> Log a drive</button>}
    </div>

    {state === "error" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Could not load this learner’s practice. Check access and <button type="button" className="underline" onClick={() => void load()}>try again</button>.</p>}
    {partial && <p role="status" className="rounded-xl bg-[#E4EFF2] p-3 text-sm text-[#095969]">Showing the latest {drives.length} drives. Older drives are not included in these totals.</p>}

    <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
      <Card className="flex flex-col gap-5 p-5" aria-label="Hours progress">
        <div className="flex items-start justify-between gap-2">
          <div><h2 className="text-base font-bold" style={heading}>Hours progress</h2><p className="mt-0.5 text-xs text-muted-foreground">Supervised driving logged</p></div>
          {state === "ready" && <Badge>{hoursLeft > 0 ? <><AlertCircle size={9} aria-hidden="true" /> {hours(hoursLeft * 60)} hrs left</> : <><CheckCircle2 size={9} aria-hidden="true" /> 40 hrs logged</>}</Badge>}
        </div>
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-10 xl:flex-col xl:items-stretch xl:gap-5">
        <div className="flex justify-center"><ProgressRing value={totals.total} max={TARGET_HOURS} /></div>
        <div className="space-y-4 md:flex-1">
          <ProgressBar label="Day driving" value={totals.day} max={TARGET_HOURS - TARGET_NIGHT_HOURS} colour="#0C7A8D" />
          <ProgressBar label="Night driving" value={totals.night} max={TARGET_NIGHT_HOURS} colour="#12B5C9" />
        </div>
        </div>
        <div className="flex items-start gap-2 border-t border-border pt-3">
          <CheckCircle2 size={13} className="mt-0.5 flex-shrink-0 text-[#0C7A8D]" aria-hidden="true" />
          <span className="text-[11px] leading-snug text-muted-foreground"><span className="font-semibold text-foreground">Georgia</span> — DDS describes 40 hours including 6 at night. A personal record, not certification. <button type="button" className="text-[11px] text-[#0C7A8D] underline" onClick={() => onNavigate("requirements")}>Details</button></span>
        </div>
      </Card>

      <Card className="flex min-w-0 flex-col overflow-hidden" aria-label="Recent drives">
        <CardHeader title="Recent drives" subtitle={drives.length ? `Last ${Math.min(drives.length, 5)} supervised sessions` : "No drives logged yet"} action={<button type="button" className="flex items-center gap-1 text-xs font-medium text-[#0C7A8D] hover:underline" onClick={() => onNavigate("logs")}>View all <ChevronRight size={12} aria-hidden="true" /></button>} />
        {state === "loading" && <p className="px-5 pb-5 text-sm text-muted-foreground">Loading practice…</p>}
        {state === "ready" && !drives.length && <div className="flex flex-1 flex-col items-start gap-3 px-5 pb-5 text-sm text-muted-foreground"><p>When a supervisor logs a drive, it appears here with its route and the skills practised.</p>{canRecord && <button type="button" className={ghostButton} disabled={blocked} onClick={() => onLogDrive(selected)}><Plus size={14} aria-hidden="true" /> Log the first drive</button>}</div>}
        {drives.length > 0 && <ul className="divide-y divide-border/60 border-t border-border lg:hidden" aria-label="Recent drives list">{drives.slice(0, 5).map((drive) => {
          const tags = [...(drive.practicedSkills ?? []), ...(drive.practicedConditions ?? [])];
          return <li key={drive.id} className="space-y-1.5 px-5 py-3.5">
            <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-medium text-foreground">{drive.routeSnapshot?.name ?? "Drive"}</span><span className="whitespace-nowrap text-xs text-muted-foreground" style={mono}>{formatDuration(drive.minutes)}</span></div>
            <p className="text-xs text-muted-foreground" style={mono}>{formatDate(drive.date)}{drive.nightMinutes > 0 && <span className="text-[#12B5C9]"> · {formatDuration(drive.nightMinutes)} night</span>}</p>
            {tags.length > 0 && <div className="flex flex-wrap gap-1.5">{tags.map((tag) => <SkillTag key={tag} label={tag} />)}</div>}
          </li>;
        })}</ul>}
        {drives.length > 0 && <div className="hidden flex-1 overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead><tr className="border-y border-border bg-muted/50">{["Date", "Route", "Duration", "Practised"].map((h) => <th key={h} scope="col" className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>{h}</th>)}</tr></thead>
            <tbody>{drives.slice(0, 5).map((drive) => {
              const tags = [...(drive.practicedSkills ?? []), ...(drive.practicedConditions ?? [])];
              return <tr key={drive.id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                <td className="whitespace-nowrap px-5 py-3.5 text-xs text-muted-foreground" style={mono}>{formatDate(drive.date)}</td>
                <td className="px-4 py-3.5"><span className="text-sm font-medium text-foreground">{drive.routeSnapshot?.name ?? "—"}</span></td>
                <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground" style={mono}><span className="inline-flex items-center gap-1"><Clock size={11} aria-hidden="true" />{formatDuration(drive.minutes)}</span>{drive.nightMinutes > 0 && <span className="ml-1.5 text-[#12B5C9]">· {formatDuration(drive.nightMinutes)} night</span>}</td>
                <td className="px-4 py-3.5"><div className="flex flex-wrap gap-1.5">{tags.length ? tags.slice(0, 3).map((tag) => <SkillTag key={tag} label={tag} />) : <span className="text-xs text-muted-foreground">—</span>}{tags.length > 3 && <span className="text-xs text-muted-foreground" style={mono}>+{tags.length - 3}</span>}</div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </Card>
    </div>

    {state === "ready" && <Card aria-label="Practice coverage">
      <CardHeader divided title="Practice coverage" subtitle="What’s been practised so far — exposure, not mastery" action={nextSkill ? <span className="hidden text-right text-xs text-muted-foreground sm:block">Something new to try: <strong className="text-foreground">{nextSkill}</strong></span> : undefined} />
      <div className="grid gap-5 p-5 md:grid-cols-2">
        {[{ title: "Skills", items: coverage.skills }, { title: "Roads and conditions", items: coverage.conditions }].map((group) => <div key={group.title}>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>{group.title}</h3>
          <ul className="flex flex-wrap gap-1.5">{group.items.map((item) => <li key={item.label} className="relative" title={item.count ? `${item.count} ${item.count === 1 ? "drive" : "drives"}` : "Not practised yet"}><SkillTag label={item.label} count={item.count} muted={!item.count} /><span className="sr-only">{item.count ? `, ${item.count} ${item.count === 1 ? "drive" : "drives"}` : ", not practised yet"}</span></li>)}</ul>
        </div>)}
      </div>
    </Card>}

    {state === "ready" && <Card className="overflow-hidden" aria-label="Saved routes">
      <CardHeader divided title="Saved routes" subtitle={`Private to ${space?.learnerName ?? "this learner"}’s space`} action={<button type="button" className={ghostButton} onClick={() => onNavigate("routes")}><Map size={14} aria-hidden="true" /> {routes.length ? "All routes" : "Create a route"}</button>} />
      {routes.length ? <div className="grid gap-3 p-5 md:grid-cols-2">{routes.slice(0, 4).map((route) => {
        const use = routeUse[route.id];
        return <article key={route.id} className="flex items-start gap-4 rounded-xl border border-border p-4 transition-all duration-150 hover:border-[#0C7A8D]/30 hover:bg-[#F7FBFC]">
          <RouteSketch geometry={route.geometry} roadPolyline={route.roadPolyline} label={`${route.name} route shape`} />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug text-foreground" style={heading}>{route.name}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{route.start} → {route.destination}</p>
            <p className="mt-2.5 inline-flex items-center gap-1 text-xs text-muted-foreground" style={mono}><RouteIcon size={11} aria-hidden="true" />{use ? `Driven ${use.count}× · last ${formatDate(use.last)}` : "Not driven yet"}</p>
          </div>
        </article>;
      })}</div> : <p className="p-5 text-sm text-muted-foreground">No routes yet. Draw one on the map to plan a practice drive.</p>}
    </Card>}
  </div>;
}

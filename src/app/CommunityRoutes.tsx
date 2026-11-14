import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { Bookmark, Flag, Globe2, Map as MapIcon, RefreshCw, ShieldAlert } from "lucide-react";
import { readPublicRoutes, sharedAccessRequest } from "./sharedClient";
import RouteMap from "./RouteMap";
import { decodeRoutePolyline } from "./routePolyline";
import { PRACTICE_SKILLS } from "./practiceData";
import { Badge, Card, CardHeader, RouteSketch, SkillTag, dangerButton, ghostButton, heading, mono, primaryButton } from "./design";

type Space = { id: string; learnerName: string; role: string };
type PublicRoute = { id: string; name: string; description?: string; area: string; lengthKm?: number; line: string; practicedSkills?: string[]; practicedConditions?: string[] };
type Reported = { id: string; name: string; area: string; reportCount: number; reports: { reason: string; note: string; createdAt: number }[] };
const REASONS: [string, string][] = [["unsafe", "Unsafe for learners"], ["private", "Shows a private place"], ["inaccurate", "Wrong or outdated"], ["inappropriate", "Inappropriate name or description"], ["other", "Something else"]];
const field = "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-[#0C7A8D] focus:ring-2 focus:ring-[#0C7A8D]/15";

function decode(line: string) { try { return decodeRoutePolyline(line); } catch { return []; } }

// The public route library: practice routes other families shared, with the ends trimmed.
export default function CommunityRoutes({ uid, spaces, blocked, run, active, onSaved }: { uid: string; spaces: Space[]; blocked: boolean; run: (action: () => Promise<void>) => Promise<void>; active: boolean; onSaved: () => void }) {
  const [routes, setRoutes] = useState<PublicRoute[]>([]);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [skill, setSkill] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [target, setTarget] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [moderator, setModerator] = useState(false);
  const [reported, setReported] = useState<Reported[]>([]);
  const alive = useRef(true);
  const loaded = useRef(false);
  useEffect(() => () => { alive.current = false; }, []);
  const savable = spaces.filter((space) => ["manager", "supervisor"].includes(space.role));
  useEffect(() => { setTarget((current) => savable.some((space) => space.id === current) ? current : savable[0]?.id ?? ""); }, [spaces]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    setState("loading");
    try {
      const result = await readPublicRoutes(uid);
      if (!alive.current) return;
      setRoutes(result.routes as PublicRoute[]); setCursor(result.cursor); setState("ready");
    } catch { if (alive.current) setState("error"); }
  }, [uid]);
  const refreshReports = useCallback(async () => {
    try {
      const status = await sharedAccessRequest(uid, "moderationStatus", {});
      if (!alive.current || !status.moderator) return;
      setModerator(true);
      const result = await sharedAccessRequest(uid, "listReportedRoutes", {});
      if (alive.current) setReported(result.routes);
    } catch { /* not a moderator, or offline: the panel stays hidden */ }
  }, [uid]);
  // Load when the page is first opened, not at sign-in.
  useEffect(() => { if (active && !loaded.current) { loaded.current = true; void refresh(); void refreshReports(); } }, [active, refresh, refreshReports]);
  async function loadMore() {
    if (!cursor) return;
    try {
      const result = await readPublicRoutes(uid, cursor);
      if (!alive.current) return;
      setRoutes((existing) => [...existing, ...(result.routes as PublicRoute[]).filter((item) => !existing.some((route) => route.id === item.id))]); setCursor(result.cursor);
    } catch { if (alive.current) setState("error"); }
  }

  const shown = skill ? routes.filter((route) => route.practicedSkills?.includes(skill)) : routes;
  const selected = shown.find((route) => route.id === selectedId) ?? shown[0];
  const path = useMemo(() => selected ? decode(selected.line) : [], [selected]);
  const targetSpace = savable.find((space) => space.id === target);

  function save() {
    if (!selected || !targetSpace) return;
    const route = selected, space = targetSpace;
    setMessage("");
    void run(async () => {
      await sharedAccessRequest(uid, "savePublicRoute", { publicRouteId: route.id, spaceId: space.id, operationId: crypto.randomUUID() });
      onSaved();
      if (alive.current) setMessage(`“${route.name}” saved to ${space.learnerName}’s routes. You can log drives on it now.`);
    });
  }
  function report() {
    if (!selected || !reason) return;
    const route = selected;
    setMessage("");
    void run(async () => {
      const result = await sharedAccessRequest(uid, "reportPublicRoute", { publicRouteId: route.id, reason, ...(note.trim() ? { note: note.trim() } : {}) });
      if (!alive.current) return;
      setReporting(false); setReason(""); setNote("");
      setMessage(result.reported ? "Thanks. The report was sent to DriveReady’s moderators." : "You’ve already reported this route.");
    });
  }
  function moderate(item: Reported, action: "remove" | "dismiss") {
    if (action === "remove" && !window.confirm(`Remove “${item.name}” from the community library? The family who shared it keeps their own copy.`)) return;
    void run(async () => {
      await sharedAccessRequest(uid, "moderatePublicRoute", { publicRouteId: item.id, action });
      if (!alive.current) return;
      setMessage(action === "remove" ? `“${item.name}” was removed from the library.` : `Reports for “${item.name}” were dismissed.`);
      await Promise.all([refresh(), refreshReports()]);
    });
  }

  return <section className="space-y-5 text-sm" aria-label="Community routes">
    {moderator && <Card className="border-amber-200" aria-label="Reported routes">
      <CardHeader divided title="Reported routes" subtitle="Only moderators see this. Review each report, then remove the route or dismiss the reports." action={<button type="button" className={ghostButton} disabled={blocked} onClick={() => void refreshReports()}><RefreshCw size={13} aria-hidden="true" /> Refresh reports</button>} />
      {reported.length === 0 ? <p className="flex items-center gap-2 p-5 text-muted-foreground"><ShieldAlert size={15} className="text-[#0C7A8D]" aria-hidden="true" />No open reports.</p>
        : <ul className="divide-y divide-border">{reported.map((item) => <li key={item.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
          <div className="min-w-0 flex-1"><p className="font-semibold" style={heading}>{item.name}</p><p className="text-xs text-muted-foreground">{item.area} · {item.reportCount} {item.reportCount === 1 ? "report" : "reports"}</p>
            <ul className="mt-2 space-y-1 text-xs">{item.reports.map((entry, index) => <li key={index}><span className="font-semibold">{REASONS.find(([key]) => key === entry.reason)?.[1] ?? entry.reason}</span>{entry.note && <> · “{entry.note}”</>}</li>)}</ul></div>
          <div className="flex flex-wrap gap-2"><button type="button" className={dangerButton} disabled={blocked} onClick={() => moderate(item, "remove")}>Remove route</button><button type="button" className={ghostButton} disabled={blocked} onClick={() => moderate(item, "dismiss")}>Dismiss reports</button></div>
        </li>)}</ul>}
    </Card>}

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-[#0C7A8D] to-[#12B5C9] px-5 py-5 text-white">
        <div className="min-w-0"><p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/80" style={mono}><Globe2 size={13} aria-hidden="true" />Community library</p><h2 className="mt-1 text-xl font-bold" style={heading}>Practice routes shared by DriveReady families</h2><p className="mt-1 max-w-2xl text-sm text-white/85">Managing supervisors share routes their learners practised. Names, homes and exact start and end points are never included; about 300 m is trimmed from each end.</p></div>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50" disabled={blocked || state === "loading"} onClick={() => void refresh()}><RefreshCw size={13} aria-hidden="true" /> Refresh</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3" role="group" aria-label="Filter by skill">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>Skill</span>
        {["", ...PRACTICE_SKILLS].map((item) => <button key={item || "all"} type="button" aria-pressed={skill === item} onClick={() => { setSkill(item); setSelectedId(""); }} className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${skill === item ? "border-[#0C7A8D] bg-[#0C7A8D] text-white" : "border-border bg-card text-muted-foreground hover:border-[#0C7A8D]/40 hover:text-foreground"}`} style={mono}>{item || "All"}</button>)}
      </div>
    </Card>
    {message && <p role="status" className="rounded-lg bg-[#E4EFF2] p-3 text-[#095969]">{message}</p>}

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
      <Card className="flex min-w-0 flex-col overflow-hidden">
        <CardHeader divided title="Shared routes" subtitle={state === "ready" ? `${shown.length}${cursor ? "+" : ""} ${shown.length === 1 ? "route" : "routes"}${skill ? ` with ${skill.toLowerCase()}` : ""}` : "Loading…"} />
        {state === "error" && <p role="status" className="p-5">Could not load community routes. Check your connection and refresh.</p>}
        {state === "ready" && shown.length === 0 && <p className="p-5 text-muted-foreground">{routes.length ? "No shared routes practise this skill yet." : "No routes have been shared yet. Managing supervisors can share an approved route from the Routes page."}</p>}
        <ul aria-label="Community route list" className="max-h-[560px] space-y-2 overflow-y-auto p-3">{shown.map((route) => {
          const isActive = route.id === selected?.id;
          return <li key={route.id}><button type="button" aria-pressed={isActive} onClick={() => { setSelectedId(route.id); setReporting(false); setMessage(""); }} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${isActive ? "border-[#0C7A8D]/40 bg-[#F4FAFB] shadow-[inset_3px_0_0_#0C7A8D]" : "border-border hover:border-[#0C7A8D]/25 hover:bg-muted/40"}`}>
            <RouteSketch roadPolyline={route.line} width={72} height={52} label={`${route.name} route shape`} />
            <span className="min-w-0 flex-1"><strong className="block break-words text-sm text-foreground" style={heading}>{route.name}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{route.area}{route.lengthKm ? ` · ${route.lengthKm} km` : ""}</span>
              {route.practicedSkills?.length ? <span className="mt-1.5 flex flex-wrap gap-1">{route.practicedSkills.slice(0, 3).map((tag) => <SkillTag key={tag} label={tag} />)}</span> : null}</span>
          </button></li>;
        })}</ul>
        {cursor && <div className="px-3 pb-3"><button type="button" className={`${ghostButton} w-full justify-center`} onClick={() => void loadMore()}>Load more routes</button></div>}
      </Card>

      <Card className="flex min-w-0 flex-col overflow-hidden" aria-label="Selected community route">
        <CardHeader divided title={selected ? selected.name : "Route map"} subtitle={selected ? `${selected.area}${selected.lengthKm ? ` · ${selected.lengthKm} km shown` : ""}` : "Select a shared route to see it here"} action={selected ? <Badge>Ends trimmed</Badge> : undefined} />
        <div className="p-3">
          {active && path.length >= 2 ? <RouteMap browse points={[path[0], path[path.length - 1]]} path={path} heightClass="h-72 lg:h-[400px]" label={`${selected!.name} on the map`} /> : <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl bg-[#E4EFF2] text-[#0C7A8D] lg:h-[400px]"><MapIcon size={28} aria-hidden="true" /><span className="text-xs">No route selected</span></div>}
        </div>
        {selected && <div className="space-y-4 border-t border-border px-5 py-4">
          {selected.description && <p className="leading-relaxed">{selected.description}</p>}
          {(selected.practicedSkills?.length || selected.practicedConditions?.length) ? <div className="flex flex-wrap gap-1.5" aria-label="Good for practising">{[...(selected.practicedSkills ?? []), ...(selected.practicedConditions ?? [])].map((tag) => <SkillTag key={tag} label={tag} />)}</div> : null}
          <p className="text-xs text-muted-foreground">The line starts and ends about 300 m in from where the family drove. Check it yourself before practising; it is not turn-by-turn navigation.</p>
          {savable.length > 0 ? <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 basis-full text-sm font-medium sm:basis-auto">Save to<select className={`${field} mt-1 sm:w-56`} value={target} disabled={blocked} onChange={(event) => setTarget(event.target.value)}>{savable.map((space) => <option key={space.id} value={space.id}>{space.learnerName}</option>)}</select></label>
            <button type="button" className={primaryButton} disabled={blocked || !targetSpace} onClick={save}><Bookmark size={15} aria-hidden="true" />Save to learner’s routes</button>
          </div> : <p className="text-xs text-muted-foreground">Supervisors can save community routes to a learner’s space.</p>}
          {!reporting ? <button type="button" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline hover:text-red-700" onClick={() => setReporting(true)}><Flag size={12} aria-hidden="true" />Report this route</button>
            : <form className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4" onSubmit={(event) => { event.preventDefault(); report(); }}>
              <fieldset><legend className="text-sm font-semibold text-red-800">What’s wrong with this route?</legend>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{REASONS.map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="radio" name="report-reason" className="accent-[#0C7A8D]" checked={reason === key} onChange={() => setReason(key)} />{label}</label>)}</div></fieldset>
              <label className="block text-sm font-medium">Details <span className="font-normal text-muted-foreground">(optional, only moderators see them)</span><input className={`${field} mt-1`} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} /></label>
              <div className="flex flex-wrap gap-2"><button className={dangerButton} disabled={blocked || !reason}>Send report</button><button type="button" className={ghostButton} onClick={() => { setReporting(false); setReason(""); setNote(""); }}>Cancel</button></div>
            </form>}
        </div>}
      </Card>
    </div>
  </section>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSnapshot } from "firebase/firestore";
import { Bookmark, Car, Flag, Globe2, Map as MapIcon, RefreshCw, ShieldAlert, Star, Users } from "lucide-react";
import { readPublicRoutes, readRouteTips, sharedAccessRequest } from "./sharedClient";
import { DIFFICULTY, communityRating } from "./communityStats";
import RouteMap from "./RouteMap";
import { decodeRoutePolyline } from "./routePolyline";
import { PRACTICE_SKILLS } from "./practiceData";
import { Badge, Card, CardHeader, RouteSketch, SkillTag, dangerButton, ghostButton, heading, mono, primaryButton } from "./design";

type Space = { id: string; learnerName: string; role: string };
type PublicRoute = { id: string; name: string; description?: string; area: string; lengthKm?: number; line: string; practicedSkills?: string[]; practicedConditions?: string[]; saveCount?: number; practicedCount?: number; driveCount?: number; ratingCount?: number; starsTotal?: number; difficultyTotal?: number };
type Reported = { id: string; name: string; area: string; reportCount: number; reports: { reason: string; note: string; createdAt: number }[]; tips?: { id: string; text: string; reportCount: number }[] };
type Tip = { id: string; text: string; updatedAt: number; reportCount: number };
type MyReview = { canReview: boolean; rating: { stars: number; difficulty: number } | null; tip: string; tipId: string };
const REASONS: [string, string][] = [["unsafe", "Unsafe for learners"], ["private", "Shows a private place"], ["inaccurate", "Wrong or outdated"], ["inappropriate", "Inappropriate name or description"], ["other", "Something else"]];
const field = "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-[#0C7A8D] focus:ring-2 focus:ring-[#0C7A8D]/15";

function decode(line: string) { try { return decodeRoutePolyline(line); } catch { return []; } }
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return <span className="inline-flex items-center gap-0.5" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} className={n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}</span>;
}
function DifficultyMeter({ value }: { value: number }) {
  return <span className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-2 flex-1 rounded-full ${n <= Math.round(value) ? ["bg-emerald-500", "bg-lime-500", "bg-amber-400", "bg-orange-500", "bg-red-600"][Math.round(value) - 1] : "bg-slate-200"}`} />)}</span>;
}
const SORTS: [string, string][] = [["newest", "Newest"], ["rating", "Highest rated"], ["easiest", "Easiest first"], ["hardest", "Hardest first"], ["driven", "Most driven"]];

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
  const [sort, setSort] = useState("newest");
  const [level, setLevel] = useState(0);
  const [review, setReview] = useState<MyReview | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [stars, setStars] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [tipText, setTipText] = useState("");
  const [reportingTip, setReportingTip] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const formFor = useRef("");
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
      setRoutes(result.routes as PublicRoute[]); setCursor(result.cursor); setState("ready"); setLoadedAt(Date.now());
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

  const filtered = routes.filter((route) => (!skill || route.practicedSkills?.includes(skill)) && (!level || communityRating(route).level?.level === level));
  const shown = sort === "newest" ? filtered : [...filtered].sort((a, b) => {
    const ra = communityRating(a), rb = communityRating(b);
    if (sort === "rating") return rb.stars - ra.stars || rb.count - ra.count;
    if (sort === "driven") return (b.driveCount ?? 0) - (a.driveCount ?? 0);
    const unrated = sort === "easiest" ? 9 : -9;
    return sort === "easiest" ? (ra.difficulty || unrated) - (rb.difficulty || unrated) : (rb.difficulty || unrated) - (ra.difficulty || unrated);
  });
  const selected = shown.find((route) => route.id === selectedId) ?? shown[0];
  const path = useMemo(() => selected ? decode(selected.line) : [], [selected]);
  const targetSpace = savable.find((space) => space.id === target);
  const rating = selected ? communityRating(selected) : null;
  // Load this account's own rating and tip, and the route's tips, for the selected route.
  const loadReview = useCallback(async (publicRouteId: string) => {
    try {
      const [mine, list] = await Promise.all([sharedAccessRequest(uid, "myRouteReview", { publicRouteId }), readRouteTips(uid, publicRouteId)]);
      if (!alive.current) return;
      setReview(mine); setTips(list);
      // Fill the form from the saved review only when switching routes, so a reload
      // doesn't wipe stars someone is picking.
      if (formFor.current !== publicRouteId) { formFor.current = publicRouteId; setStars(mine.rating?.stars ?? 0); setDifficulty(mine.rating?.difficulty ?? 0); setTipText(mine.tip ?? ""); }
    } catch { if (alive.current) { setReview(null); setTips([]); } }
  }, [uid]);
  const selectedKey = active ? selected?.id ?? "" : "";
  useEffect(() => { setReportingTip(""); if (selectedKey) void loadReview(selectedKey); else { setReview(null); setTips([]); } }, [selectedKey, loadReview, loadedAt]);
  function saveRating() {
    if (!selected || !stars || !difficulty) return;
    const route = selected;
    setMessage("");
    void run(async () => {
      const result = await sharedAccessRequest(uid, "rateRoute", { publicRouteId: route.id, stars: String(stars), difficulty: String(difficulty) });
      if (!alive.current) return;
      setMessage(result.updated ? "Your rating was updated." : "Thanks for rating this route.");
      await refresh();
    });
  }
  function saveTip(text: string) {
    if (!selected) return;
    const route = selected;
    setMessage("");
    void run(async () => {
      await sharedAccessRequest(uid, "setRouteTip", { publicRouteId: route.id, text });
      if (!alive.current) return;
      setMessage(text.trim() ? "Your tip was shared." : "Your tip was removed.");
      await loadReview(route.id);
    });
  }
  function flagTip(tip: Tip, reasonKey: string) {
    if (!selected) return;
    const route = selected;
    void run(async () => {
      const result = await sharedAccessRequest(uid, "reportTip", { publicRouteId: route.id, tipId: tip.id, reason: reasonKey });
      if (!alive.current) return;
      setReportingTip("");
      setMessage(result.reported ? "Thanks. The tip was sent to DriveReady’s moderators." : "You’ve already reported this tip.");
    });
  }

  function save() {
    if (!selected || !targetSpace) return;
    const route = selected, space = targetSpace;
    setMessage("");
    void run(async () => {
      await sharedAccessRequest(uid, "savePublicRoute", { publicRouteId: route.id, spaceId: space.id, operationId: crypto.randomUUID() });
      onSaved();
      if (!alive.current) return;
      setMessage(`“${route.name}” saved to ${space.learnerName}’s routes. You can log drives on it now.`);
      await refresh();
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
  function moderate(item: Reported, action: "remove" | "dismiss" | "removeTip" | "keepTip", tipId = "") {
    if (action === "remove" && !window.confirm(`Remove “${item.name}” from the community library? The family who shared it keeps their own copy.`)) return;
    void run(async () => {
      await sharedAccessRequest(uid, "moderatePublicRoute", { publicRouteId: item.id, action, ...(tipId ? { tipId } : {}) });
      if (!alive.current) return;
      setMessage(action === "remove" ? `“${item.name}” was removed from the library.` : action === "dismiss" ? `Reports for “${item.name}” were dismissed.` : action === "removeTip" ? "The tip was removed." : "The tip was kept and its reports cleared.");
      await Promise.all([refresh(), refreshReports()]);
    });
  }

  return <section className="space-y-5 text-sm" aria-label="Community routes">
    {moderator && <Card className="border-amber-200" aria-label="Reported routes">
      <CardHeader divided title="Reported routes" subtitle="Only moderators see this. Review each report, then remove the route or dismiss the reports." action={<button type="button" className={ghostButton} disabled={blocked} onClick={() => void refreshReports()}><RefreshCw size={13} aria-hidden="true" /> Refresh reports</button>} />
      {reported.length === 0 ? <p className="flex items-center gap-2 p-5 text-muted-foreground"><ShieldAlert size={15} className="text-[#0C7A8D]" aria-hidden="true" />No open reports.</p>
        : <ul className="divide-y divide-border">{reported.map((item) => <li key={item.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
          <div className="min-w-0 flex-1"><p className="font-semibold" style={heading}>{item.name}</p><p className="text-xs text-muted-foreground">{item.area} · {plural(item.reportCount, "route report", "route reports")}{item.tips?.length ? ` · ${plural(item.tips.length, "reported tip", "reported tips")}` : ""}</p>
            <ul className="mt-2 space-y-1 text-xs">{item.reports.map((entry, index) => <li key={index}><span className="font-semibold">{REASONS.find(([key]) => key === entry.reason)?.[1] ?? entry.reason}</span>{entry.note && <> · “{entry.note}”</>}</li>)}</ul>
            {item.tips?.length ? <ul className="mt-2 space-y-2" aria-label="Reported tips">{item.tips.map((tip) => <li key={tip.id} className="rounded-lg bg-amber-50 p-2 text-xs"><p>“{tip.text}” <span className="text-muted-foreground">· {plural(tip.reportCount, "report", "reports")}</span></p><div className="mt-1.5 flex flex-wrap gap-2"><button type="button" className={dangerButton} disabled={blocked} onClick={() => moderate(item, "removeTip", tip.id)}>Remove tip</button><button type="button" className={ghostButton} disabled={blocked} onClick={() => moderate(item, "keepTip", tip.id)}>Keep tip</button></div></li>)}</ul> : null}</div>
          {item.reportCount > 0 && <div className="flex flex-wrap gap-2"><button type="button" className={dangerButton} disabled={blocked} onClick={() => moderate(item, "remove")}>Remove route</button><button type="button" className={ghostButton} disabled={blocked} onClick={() => moderate(item, "dismiss")}>Dismiss reports</button></div>}
        </li>)}</ul>}
    </Card>}

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-[#0C7A8D] to-[#12B5C9] px-5 py-5 text-white">
        <div className="min-w-0"><p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/80" style={mono}><Globe2 size={13} aria-hidden="true" />Community library</p><h2 className="mt-1 text-xl font-bold" style={heading}>Practice routes shared by DriveReady families</h2><p className="mt-1 max-w-2xl text-sm text-white/85">Managing supervisors share routes their learners practised. Names are never included, and nothing within 400–600 m of a route’s start, end or any place the family marked private is shown.</p></div>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50" disabled={blocked || state === "loading"} onClick={() => void refresh()}><RefreshCw size={13} aria-hidden="true" /> Refresh</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3" role="group" aria-label="Filter by skill">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>Skill</span>
        {["", ...PRACTICE_SKILLS].map((item) => <button key={item || "all"} type="button" aria-pressed={skill === item} onClick={() => { setSkill(item); setSelectedId(""); }} className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${skill === item ? "border-[#0C7A8D] bg-[#0C7A8D] text-white" : "border-border bg-card text-muted-foreground hover:border-[#0C7A8D]/40 hover:text-foreground"}`} style={mono}>{item || "All"}</button>)}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-border px-5 py-3">
        <label className="text-xs font-medium text-muted-foreground">Community difficulty<select className={`${field} mt-1 w-44 py-1.5`} value={level} onChange={(event) => { setLevel(Number(event.target.value)); setSelectedId(""); }}><option value={0}>Any</option>{DIFFICULTY.map((item) => <option key={item.level} value={item.level}>{item.level} · {item.name}</option>)}</select></label>
        <label className="text-xs font-medium text-muted-foreground">Sort by<select className={`${field} mt-1 w-44 py-1.5`} value={sort} onChange={(event) => setSort(event.target.value)}>{SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
    </Card>
    {message && <p role="status" className="rounded-lg bg-[#E4EFF2] p-3 text-[#095969]">{message}</p>}

    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
      <Card className="flex min-w-0 flex-col overflow-hidden">
        <CardHeader divided title="Shared routes" subtitle={state === "ready" ? `${shown.length}${cursor ? "+" : ""} ${shown.length === 1 ? "route" : "routes"}${skill ? ` with ${skill.toLowerCase()}` : ""}${level ? ` · ${DIFFICULTY[level - 1].name}` : ""}` : "Loading…"} />
        {state === "error" && <p role="status" className="p-5">Could not load community routes. Check your connection and refresh.</p>}
        {state === "ready" && shown.length === 0 && <p className="p-5 text-muted-foreground">{routes.length ? "No shared routes match these filters yet." : "No routes have been shared yet. Managing supervisors can share an approved route from the Routes page."}</p>}
        <ul aria-label="Community route list" className="max-h-[560px] space-y-2 overflow-y-auto p-3">{shown.map((route) => {
          const isActive = route.id === selected?.id;
          return <li key={route.id}><button type="button" aria-pressed={isActive} onClick={() => { setSelectedId(route.id); setReporting(false); setMessage(""); }} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${isActive ? "border-[#0C7A8D]/40 bg-[#F4FAFB] shadow-[inset_3px_0_0_#0C7A8D]" : "border-border hover:border-[#0C7A8D]/25 hover:bg-muted/40"}`}>
            <RouteSketch roadPolyline={route.line} width={72} height={52} label={`${route.name} route shape`} />
            <span className="min-w-0 flex-1"><strong className="block break-words text-sm text-foreground" style={heading}>{route.name}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{route.area}{route.lengthKm ? ` · ${route.lengthKm} km` : ""}</span>
              {(() => { const r = communityRating(route); return <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">{r.count ? <><span className="inline-flex items-center gap-1"><Stars value={r.stars} size={11} /><span className="font-semibold text-foreground">{r.stars.toFixed(1)}</span>({r.count})</span><span className="rounded-md border border-border bg-card px-1.5 py-px font-semibold text-foreground" style={mono}>{r.level?.name}</span></> : <span>Not rated yet</span>}<span>Driven {route.driveCount ?? 0}×</span></span>; })()}
              {route.practicedSkills?.length ? <span className="mt-1.5 flex flex-wrap gap-1">{route.practicedSkills.slice(0, 3).map((tag) => <SkillTag key={tag} label={tag} />)}</span> : null}</span>
          </button></li>;
        })}</ul>
        {cursor && <div className="px-3 pb-3"><button type="button" className={`${ghostButton} w-full justify-center`} onClick={() => void loadMore()}>Load more routes</button></div>}
      </Card>

      <Card className="flex min-w-0 flex-col overflow-hidden" aria-label="Selected community route">
        <CardHeader divided title={selected ? selected.name : "Route map"} subtitle={selected ? `${selected.area}${selected.lengthKm ? ` · ${selected.lengthKm} km shown` : ""}` : "Select a shared route to see it here"} action={selected ? <Badge>Privacy-trimmed</Badge> : undefined} />
        <div className="p-3">
          {active && path.length >= 2 ? <RouteMap browse points={[path[0], path[path.length - 1]]} path={path} heightClass="h-72 lg:h-[400px]" label={`${selected!.name} on the map`} /> : <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl bg-[#E4EFF2] text-[#0C7A8D] lg:h-[400px]"><MapIcon size={28} aria-hidden="true" /><span className="text-xs">No route selected</span></div>}
        </div>
        {selected && <div className="space-y-4 border-t border-border px-5 py-4">
          {selected.description && <p className="leading-relaxed">{selected.description}</p>}
          {(selected.practicedSkills?.length || selected.practicedConditions?.length) ? <div className="flex flex-wrap gap-1.5" aria-label="Good for practising">{[...(selected.practicedSkills ?? []), ...(selected.practicedConditions ?? [])].map((tag) => <SkillTag key={tag} label={tag} />)}</div> : null}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Community stats">
            {[[<Bookmark key="b" size={13} />, "Saved by", plural(selected.saveCount ?? 0, "family", "families")], [<Users key="u" size={13} />, "Practised by", plural(selected.practicedCount ?? 0, "family", "families")], [<Car key="c" size={13} />, "Driven", plural(selected.driveCount ?? 0, "time", "times")], [<Star key="s" size={13} />, "Rating", rating?.count ? `${rating.stars.toFixed(1)} of 5` : "Not rated"]].map(([icon, term, value]) => <div key={term as string} className="rounded-xl border border-border bg-[#F4FAFB] px-3 py-2"><dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#0C7A8D]" style={mono}>{icon}{term}</dt><dd className="mt-0.5 text-sm font-bold" style={heading}>{value}</dd></div>)}
          </dl>
          <div role="group" className="rounded-xl border border-border p-3" aria-label="Community difficulty">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>Community difficulty</p><p className="text-sm font-bold" style={heading}>{rating?.level ? `${rating.level.name} · ${rating.difficulty.toFixed(1)} of 5` : "Not rated yet"}</p></div>
            <div className="mt-2"><DifficultyMeter value={rating?.difficulty ?? 0} /></div>
            <p className="mt-1.5 text-xs text-muted-foreground">{rating?.count ? `${rating.level?.hint}. From ${plural(rating.count, "rating", "ratings")}${rating.count < 3 ? "; an early estimate that settles as more families rate it" : ""}.` : "Families who drive this route rate how hard it felt; the average becomes its difficulty."}</p>
          </div>
          <p className="text-xs text-muted-foreground">Parts near where the family started, finished or marked private are left out, so the line may begin and end mid-street. Check it yourself before practising; it is not turn-by-turn navigation.</p>
          {savable.length > 0 ? <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 basis-full text-sm font-medium sm:basis-auto">Save to<select className={`${field} mt-1 sm:w-56`} value={target} disabled={blocked} onChange={(event) => setTarget(event.target.value)}>{savable.map((space) => <option key={space.id} value={space.id}>{space.learnerName}</option>)}</select></label>
            <button type="button" className={primaryButton} disabled={blocked || !targetSpace} onClick={save}><Bookmark size={15} aria-hidden="true" />Save to learner’s routes</button>
          </div> : <p className="text-xs text-muted-foreground">Supervisors can save community routes to a learner’s space.</p>}
          {review?.canReview ? <section className="space-y-3 rounded-xl border border-[#0C7A8D]/25 bg-[#F4FAFB] p-4" aria-label="Rate this route">
            <p className="text-sm font-bold" style={heading}>{review.rating ? "Your rating" : "You’ve driven this route. How was it?"}</p>
            <fieldset><legend className="text-xs font-medium text-muted-foreground">Overall</legend><div className="mt-1 flex gap-1" role="radiogroup" aria-label="Stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} ${n === 1 ? "star" : "stars"}`} className="rounded p-0.5 transition-transform hover:scale-110" onClick={() => setStars(n)}><Star size={24} className={n <= stars ? "fill-amber-400 text-amber-400" : "text-slate-300"} /></button>)}</div></fieldset>
            <fieldset><legend className="text-xs font-medium text-muted-foreground">How hard did it feel?</legend><div className="mt-1 grid grid-cols-5 gap-1" role="radiogroup" aria-label="Difficulty">{DIFFICULTY.map((item) => <button key={item.level} type="button" role="radio" aria-checked={difficulty === item.level} className={`rounded-lg border px-1 py-1.5 text-center text-[11px] font-semibold transition-colors ${difficulty === item.level ? "border-[#0C7A8D] bg-[#0C7A8D] text-white" : "border-border bg-card text-muted-foreground hover:border-[#0C7A8D]/40"}`} onClick={() => setDifficulty(item.level)}><span className="block text-sm" style={heading}>{item.level}</span>{item.name}</button>)}</div>
              <p className="mt-1 text-xs text-muted-foreground">{difficulty ? DIFFICULTY[difficulty - 1].hint : "Pick the level that matched your experience."}</p></fieldset>
            <button type="button" className={primaryButton} disabled={blocked || !stars || !difficulty} onClick={saveRating}>{review.rating ? "Update rating" : "Save rating"}</button>
            <label className="block border-t border-border pt-3 text-sm font-medium">Tip for other families <span className="font-normal text-muted-foreground">(optional, shared without your name)</span><textarea className={`${field} mt-1 min-h-16`} maxLength={280} value={tipText} placeholder="e.g. Quietest on Sunday mornings; the left turn onto Main has a short light." onChange={(event) => setTipText(event.target.value)} /></label>
            <div className="flex flex-wrap gap-2"><button type="button" className={ghostButton} disabled={blocked || !tipText.trim() || tipText.trim() === review.tip} onClick={() => saveTip(tipText)}>{review.tip ? "Update tip" : "Share tip"}</button>{review.tip && <button type="button" className={ghostButton} disabled={blocked} onClick={() => saveTip("")}>Remove tip</button>}</div>
          </section> : review && <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Log a drive on this route to rate it and share a tip. Save it to a learner’s routes, practise it, then come back.</p>}
          <section aria-label="Tips from families" className="space-y-2">
            <h3 className="text-sm font-bold" style={heading}>Tips from families</h3>
            {tips.filter((tip) => tip.reportCount < 3).length === 0 ? <p className="text-xs text-muted-foreground">No tips yet.</p>
              : <ul className="space-y-2">{tips.filter((tip) => tip.reportCount < 3).map((tip) => <li key={tip.id} className="rounded-xl border border-border bg-card p-3">
                <p className="leading-relaxed">{tip.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">{tip.id === review?.tipId ? <span className="font-semibold text-[#0C7A8D]">Your tip</span> : <span>A DriveReady family</span>}{tip.updatedAt ? <span>· {new Date(tip.updatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span> : null}
                  {tip.id !== review?.tipId && (reportingTip === tip.id ? <span className="flex flex-wrap items-center gap-1">· Report as:{REASONS.filter(([key]) => key !== "private" && key !== "inaccurate").map(([key, label]) => <button key={key} type="button" className="rounded border border-red-200 px-1.5 text-red-800 hover:bg-red-50" disabled={blocked} onClick={() => flagTip(tip, key)}>{label}</button>)}<button type="button" className="underline" onClick={() => setReportingTip("")}>Cancel</button></span> : <button type="button" className="underline hover:text-red-700" onClick={() => setReportingTip(tip.id)}>Report</button>)}</p>
              </li>)}</ul>}
          </section>
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

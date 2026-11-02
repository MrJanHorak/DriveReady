import { useState, useRef, useCallback, useMemo } from "react";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import StateRequirements from "./StateRequirements";
import {
  LayoutDashboard,
  Map,
  FileText,
  ClipboardList,
  Bell,
  ChevronDown,
  Plus,
  Star,
  Clock,
  Navigation,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  X,
  MapPin,
  ChevronLeft,
  Trash2,
  Shield,
  BookOpen,
  Sliders,
  Upload,
  Info,
  Search,
  SlidersHorizontal,
  Users,
  UserCircle2,
  Layers,
  ZoomIn,
  ZoomOut,
  Compass,
  Heart,
  ThumbsUp,
  Route,
  ArrowUpRight,
  Filter,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type NavItem = { id: string; label: string; icon: React.ReactNode };
type Driver = { id: string; name: string; age: number; initials: string };
type DriveLog = { date: string; route: string; duration: string; skills: string[] };
type DashRoute = { id: string; title: string; subtitle: string; difficulty: number; duration: string; tags: string[]; mapColor: string };
type Waypoint = { x: number; y: number; label: string };

type ExplorerRoute = {
  id: string;
  title: string;
  neighborhood: string;
  difficulty: number;
  durationMin: number;
  environment: "Residential" | "Urban" | "Highway" | "Mixed" | "Rural";
  skills: string[];
  saves: number;
  drives: number;
  rating: number;
  author: string;
  authorInitials: string;
  mine?: boolean;
  pinX: number;
  pinY: number;
  description: string;
  pathD: string;
};

// ── Static data ────────────────────────────────────────────────────────────
const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
  { id: "routes", label: "Route Explorer", icon: <Map size={17} /> },
  { id: "logs", label: "Driving Logs", icon: <FileText size={17} /> },
  { id: "requirements", label: "State Requirements", icon: <ClipboardList size={17} /> },
];

const drivers: Driver[] = [
  { id: "1", name: "Emma Hartfield", age: 16, initials: "EH" },
  { id: "2", name: "Tyler Hartfield", age: 17, initials: "TH" },
];

const driveLogs: DriveLog[] = [
  { date: "Jul 3, 2026", route: "Riverside Loop", duration: "1h 12m", skills: ["Highway Merging", "Lane Changes"] },
  { date: "Jun 29, 2026", route: "Downtown Grid", duration: "45m", skills: ["Parallel Parking", "Pedestrian Awareness"] },
  { date: "Jun 25, 2026", route: "Quiet Business Park", duration: "38m", skills: ["Low-Speed Turns", "Parking Lot"] },
  { date: "Jun 20, 2026", route: "I-285 Night Segment", duration: "52m", skills: ["Night Driving", "Highway Merging"] },
  { date: "Jun 15, 2026", route: "Suburbs East Circuit", duration: "1h 04m", skills: ["4-Way Stop", "Residential Speed"] },
];

const dashRoutes: DashRoute[] = [
  { id: "1", title: "Quiet Business Park", subtitle: "Great for Day 1 — wide lanes, minimal traffic", difficulty: 1, duration: "30 mins", tags: ["Beginner", "Low Traffic"], mapColor: "#E4EFF2" },
  { id: "2", title: "Riverside Scenic Loop", subtitle: "Gentle curves, school zone practice", difficulty: 2, duration: "45 mins", tags: ["School Zone", "Curves"], mapColor: "#E8F4E8" },
  { id: "3", title: "Downtown Grid — Midtown", subtitle: "Parallel parking & pedestrian traffic", difficulty: 3, duration: "55 mins", tags: ["Parking", "Urban"], mapColor: "#FFF3E4" },
  { id: "4", title: "I-285 Onramp Circuit", subtitle: "Supervised highway merging practice", difficulty: 4, duration: "40 mins", tags: ["Highway", "Merging"], mapColor: "#F0E8F5" },
];

const landmarks = [
  "Evans High School — Martinez, GA",
  "Augusta Exchange Shopping Center",
  "Riverwatch Parkway & I-20 Junction",
  "Wesley Road & Washington Road",
  "Walton Way & 15th Street",
  "Augusta Mall — Gate 3 Entrance",
];

const allSkills = [
  "Roundabouts", "Parallel Parking", "Highway Merging", "4-Way Stop",
  "Lane Changes", "Night Driving", "School Zone", "Pedestrian Awareness",
  "Blind Spot Checks", "Freeway Entry/Exit", "Three-Point Turn", "Yield Signs",
  "Emergency Braking", "Rain Driving",
];

const difficultyLabels = ["", "Beginner", "Easy", "Moderate", "Challenging", "Advanced"];

// ── Route Explorer data ────────────────────────────────────────────────────
const explorerRoutes: ExplorerRoute[] = [
  {
    id: "er1",
    title: "Quiet Business Park Loop",
    neighborhood: "Martinez, GA",
    difficulty: 1,
    durationMin: 28,
    environment: "Residential",
    skills: ["Low-Speed Turns", "Parking Lot", "4-Way Stop"],
    saves: 142,
    drives: 387,
    rating: 4.8,
    author: "Sarah K.",
    authorInitials: "SK",
    pinX: 148,
    pinY: 198,
    description: "Perfect first-drive route. Wide lanes, no traffic lights for the first half. Great for building initial confidence.",
    pathD: "M148,198 L170,205 L195,200 L210,185 L200,172 L178,175 L148,198",
  },
  {
    id: "er2",
    title: "Evans Neighborhood Circuit",
    neighborhood: "Evans, GA",
    difficulty: 2,
    durationMin: 42,
    environment: "Residential",
    skills: ["Residential Speed", "School Zone", "Roundabouts"],
    saves: 98,
    drives: 211,
    rating: 4.6,
    author: "Mike T.",
    authorInitials: "MT",
    pinX: 112,
    pinY: 155,
    description: "Quiet suburban streets with one roundabout near the library. School zone speed practice included.",
    pathD: "M112,155 L130,148 L152,153 L165,165 L155,180 L135,175 L112,155",
  },
  {
    id: "er3",
    title: "Riverwatch Parkway Run",
    neighborhood: "North Augusta",
    difficulty: 2,
    durationMin: 35,
    environment: "Mixed",
    skills: ["Lane Changes", "Yield Signs", "Pedestrian Awareness"],
    saves: 76,
    drives: 163,
    rating: 4.4,
    author: "Dana R.",
    authorInitials: "DR",
    pinX: 210,
    pinY: 120,
    description: "Scenic run along Riverwatch with two yield signs and a busy pedestrian corridor near Riverview Park.",
    pathD: "M210,120 L235,115 Q260,110 275,125 L270,145 L245,148 L215,140 L210,120",
  },
  {
    id: "er4",
    title: "Downtown Broad Street Grid",
    neighborhood: "Augusta Historic District",
    difficulty: 3,
    durationMin: 52,
    environment: "Urban",
    skills: ["Parallel Parking", "Pedestrian Awareness", "4-Way Stop", "Lane Changes"],
    saves: 204,
    drives: 519,
    rating: 4.2,
    author: "James P.",
    authorInitials: "JP",
    pinX: 285,
    pinY: 175,
    description: "Full urban experience. Broad Street parallel parking is excellent skill-building. Busy pedestrian crossings near the market.",
    pathD: "M285,175 L310,170 L320,185 L310,200 L290,205 L275,195 L285,175",
  },
  {
    id: "er5",
    title: "Washington Road Corridor",
    neighborhood: "West Augusta",
    difficulty: 3,
    durationMin: 48,
    environment: "Mixed",
    skills: ["Highway Merging", "Lane Changes", "Blind Spot Checks"],
    saves: 87,
    drives: 244,
    rating: 4.0,
    author: "Carol M.",
    authorInitials: "CM",
    pinX: 230,
    pinY: 215,
    description: "High-speed arterial road with multiple lane merge points. Best done on weekday mornings to avoid peak congestion.",
    pathD: "M230,215 L260,210 L280,220 L275,240 L248,242 L228,232 L230,215",
  },
  {
    id: "er6",
    title: "I-20 Onramp East Circuit",
    neighborhood: "Grovetown, GA",
    difficulty: 4,
    durationMin: 40,
    environment: "Highway",
    skills: ["Highway Merging", "Freeway Entry/Exit", "Blind Spot Checks", "Lane Changes"],
    saves: 55,
    drives: 98,
    rating: 3.9,
    author: "Tom W.",
    authorInitials: "TW",
    pinX: 355,
    pinY: 230,
    description: "Short highway loop with two onramps and one exit. Keep speed at 60 mph. Best with 30+ hrs logged prior.",
    pathD: "M355,230 L385,225 L400,240 L390,258 L360,255 L345,242 L355,230",
  },
  {
    id: "er7",
    title: "Bobby Jones Expressway Loop",
    neighborhood: "Augusta North",
    difficulty: 4,
    durationMin: 55,
    environment: "Highway",
    skills: ["Highway Merging", "Freeway Entry/Exit", "Emergency Braking", "Lane Changes"],
    saves: 44,
    drives: 76,
    rating: 3.7,
    author: "Lisa H.",
    authorInitials: "LH",
    pinX: 275,
    pinY: 95,
    description: "Full expressway experience. Ramp metering lights present. Challenging merge geometry at exit 5.",
    pathD: "M275,95 Q310,85 330,100 L325,120 Q305,130 278,118 L275,95",
  },
  {
    id: "er8",
    title: "Grovetown Suburban Run",
    neighborhood: "Grovetown, GA",
    difficulty: 2,
    durationMin: 38,
    environment: "Residential",
    skills: ["Residential Speed", "4-Way Stop", "Yield Signs"],
    saves: 61,
    drives: 129,
    rating: 4.5,
    author: "Sarah K.",
    authorInitials: "SK",
    mine: true,
    pinX: 388,
    pinY: 195,
    description: "Quiet cul-de-sac neighborhood perfect for building speed awareness and stop sign habits.",
    pathD: "M388,195 L410,190 L422,205 L415,220 L395,218 L382,207 L388,195",
  },
  {
    id: "er9",
    title: "Fort Gordon Gate 1 Loop",
    neighborhood: "Fort Eisenhower, GA",
    difficulty: 2,
    durationMin: 32,
    environment: "Residential",
    skills: ["4-Way Stop", "Residential Speed", "Pedestrian Awareness"],
    saves: 33,
    drives: 87,
    rating: 4.3,
    author: "Sarah K.",
    authorInitials: "SK",
    mine: true,
    pinX: 340,
    pinY: 285,
    description: "Well-marked roads with low traffic. Military gate protocols provide real-world practice for controlled entry points.",
    pathD: "M340,285 L365,280 L375,295 L365,310 L342,308 L330,295 L340,285",
  },
  {
    id: "er10",
    title: "Aiken SC Cross-Border Run",
    neighborhood: "Aiken, SC",
    difficulty: 3,
    durationMin: 65,
    environment: "Mixed",
    skills: ["Highway Merging", "Lane Changes", "Roundabouts", "Yield Signs"],
    saves: 29,
    drives: 54,
    rating: 4.1,
    author: "Phil D.",
    authorInitials: "PD",
    pinX: 82,
    pinY: 268,
    description: "Crosses state line via Bridge Road. Aiken has multiple well-designed roundabouts — excellent for practice.",
    pathD: "M82,268 L105,262 L118,275 L110,292 L88,290 L76,278 L82,268",
  },
];

const difficultyColor = (d: number) => {
  if (d <= 1) return { bg: "#E4EFF2", text: "#0C7A8D", border: "#0C7A8D22" };
  if (d === 2) return { bg: "#E8F4E8", text: "#15803D", border: "#15803D22" };
  if (d === 3) return { bg: "#FFF7ED", text: "#C2410C", border: "#C2410C22" };
  return { bg: "#FDF2F8", text: "#A21CAF", border: "#A21CAF22" };
};

const pinColor = (d: number) => {
  if (d <= 1) return "#0C7A8D";
  if (d === 2) return "#15803D";
  if (d === 3) return "#EA580C";
  return "#A21CAF";
};

const envIcon = (env: ExplorerRoute["environment"]) => {
  switch (env) {
    case "Residential": return "🏘";
    case "Urban": return "🏙";
    case "Highway": return "🛣";
    case "Mixed": return "⚡";
    case "Rural": return "🌿";
  }
};

// ── Reusable sub-components ────────────────────────────────────────────────
function SkillTag({ label }: { label: string }) {
  const colorMap: Record<string, string> = {
    "Highway Merging": "bg-blue-50 text-blue-700 border-blue-100",
    "Lane Changes": "bg-indigo-50 text-indigo-700 border-indigo-100",
    "Parallel Parking": "bg-violet-50 text-violet-700 border-violet-100",
    "Pedestrian Awareness": "bg-green-50 text-green-700 border-green-100",
    "Low-Speed Turns": "bg-teal-50 text-teal-700 border-teal-100",
    "Parking Lot": "bg-cyan-50 text-cyan-700 border-cyan-100",
    "Night Driving": "bg-slate-100 text-slate-700 border-slate-200",
    "4-Way Stop": "bg-orange-50 text-orange-700 border-orange-100",
    "Residential Speed": "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${colorMap[label] ?? "bg-gray-50 text-gray-600 border-gray-100"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {label}
    </span>
  );
}

function DifficultyDots({ level, small }: { level: number; small?: boolean }) {
  const sz = small ? "w-1.5 h-1.5" : "w-2 h-2";
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={`${sz} rounded-full transition-colors ${i < level ? "bg-[#0C7A8D]" : "bg-gray-200"}`} />
      ))}
      {!small && <span className="ml-1 text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{level}/5</span>}
    </div>
  );
}

function MapPlaceholder({ color, routeId }: { color: string; routeId: string }) {
  const paths: Record<string, string> = {
    "1": "M20,70 L60,50 L100,55 L130,40 L160,55",
    "2": "M20,60 Q50,30 80,55 Q110,75 140,50 L160,45",
    "3": "M20,40 L60,40 L60,70 L100,70 L100,40 L140,40 L140,80 L160,80",
    "4": "M20,70 Q60,65 80,50 L130,50 L160,45",
  };
  const path = paths[routeId] ?? paths["1"];
  return (
    <div className="rounded-lg flex-shrink-0 relative overflow-hidden" style={{ width: 90, height: 64, backgroundColor: color }}>
      <svg width="100%" height="100%" viewBox="0 0 180 90" className="absolute inset-0">
        <line x1="0" y1="30" x2="180" y2="30" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
        <line x1="0" y1="60" x2="180" y2="60" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
        <line x1="60" y1="0" x2="60" y2="90" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
        <line x1="120" y1="0" x2="120" y2="90" stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
        <path d={path} fill="none" stroke="#0C7A8D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy={parseInt(path.split(",")[1])} r="3.5" fill="#0C7A8D" />
        <circle cx="160" cy={parseInt(path.split(" ").pop()!)} r="3.5" fill="#12B5C9" />
      </svg>
      <div className="absolute bottom-1.5 right-1.5 bg-white/80 rounded p-0.5">
        <Navigation size={8} className="text-[#0C7A8D]" />
      </div>
    </div>
  );
}

function CircularProgressRing({ value, max }: { value: number; max: number }) {
  const r = 72;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value / max);
  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="#E4EFF2" strokeWidth="12" />
        <circle cx="90" cy="90" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0C7A8D" />
            <stop offset="100%" stopColor="#12B5C9" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-[#0C7A8D]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1 }}>{value}</span>
        <span className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>/ {max} hrs</span>
        <span className="text-xs font-medium text-[#12B5C9] mt-1">{Math.round((value / max) * 100)}%</span>
      </div>
    </div>
  );
}

function SubProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground font-medium">{label}</span>
        <span className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}/{max} hrs</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min((value / max) * 100, 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Teal input styles ──────────────────────────────────────────────────────
const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground transition-all duration-150 outline-none focus:border-[#0C7A8D] focus:ring-2 focus:ring-[#0C7A8D]/15 hover:border-[#0C7A8D]/40";
const selectCls = "w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground transition-all duration-150 outline-none focus:border-[#0C7A8D] focus:ring-2 focus:ring-[#0C7A8D]/15 hover:border-[#0C7A8D]/40 appearance-none cursor-pointer";

// ── Wizard steps (Step 1–3) ────────────────────────────────────────────────
const wizardSteps = [
  { id: 1, label: "Route Map", icon: <Map size={15} />, desc: "Plot your route on the map" },
  { id: 2, label: "Skills & Details", icon: <Sliders size={15} />, desc: "Difficulty, duration & skills" },
  { id: 3, label: "Safety & Review", icon: <Shield size={15} />, desc: "Safety notes & publish" },
];

function Step1({ routeTitle, setRouteTitle, landmark, setLandmark, waypoints, setWaypoints }: { routeTitle: string; setRouteTitle: (v: string) => void; landmark: string; setLandmark: (v: string) => void; waypoints: Waypoint[]; setWaypoints: (v: Waypoint[]) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringMap, setIsHoveringMap] = useState(false);
  const getSVGCoords = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: Math.round(((e.clientX - rect.left) / rect.width) * 600), y: Math.round(((e.clientY - rect.top) / rect.height) * 400) };
  }, []);
  const waypointPath = waypoints.length > 1 ? waypoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") : null;
  return (
    <div className="flex flex-1 min-h-0 gap-0">
      <div className="w-[300px] flex-shrink-0 flex flex-col gap-5 px-6 py-5 border-r border-border overflow-y-auto">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Route Title</h3>
          <input className={inputCls} placeholder="e.g., Evans High School Perimeter Run" value={routeTitle} onChange={(e) => setRouteTitle(e.target.value)} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Starting Landmark</h3>
          <div className="relative">
            <select className={selectCls} value={landmark} onChange={(e) => setLandmark(e.target.value)}>
              <option value="">Select a landmark…</option>
              {landmarks.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div className="rounded-xl bg-[#E4EFF2]/60 border border-[#0C7A8D]/12 p-4">
          <div className="flex items-start gap-2.5">
            <Info size={13} className="text-[#0C7A8D] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed"><span className="font-semibold text-[#0C7A8D]">How to place your route:</span> Click anywhere on the map to drop a waypoint. Your first click sets the <span className="font-medium text-foreground">starting point</span>.</p>
          </div>
        </div>
        {waypoints.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Waypoints <span className="text-muted-foreground font-normal">({waypoints.length})</span></h3>
              <button onClick={() => setWaypoints([])} className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1 transition-colors"><Trash2 size={11} /> Clear all</button>
            </div>
            <div className="space-y-1.5">
              {waypoints.map((wp, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-background border border-border">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 ${i === 0 ? "bg-[#0C7A8D]" : "bg-[#12B5C9]"}`}>{i + 1}</div>
                  <span className="text-xs font-medium text-foreground">{wp.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{wp.x},{wp.y}</span>
                  <button onClick={() => setWaypoints(waypoints.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400 transition-colors"><X size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 relative bg-[#EFF7F9] overflow-hidden">
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-sm">
            <MapPin size={12} className="text-[#0C7A8D]" />
            <span className="text-xs font-medium text-foreground">Augusta Metro, GA</span>
          </div>
          {waypoints.length > 0 && (
            <div className="bg-white/90 backdrop-blur-sm border border-[#0C7A8D]/20 rounded-lg px-3 py-1.5 shadow-sm">
              <span className="text-[11px] font-medium text-[#0C7A8D]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{waypoints.length} waypoint{waypoints.length !== 1 ? "s" : ""} placed</span>
            </div>
          )}
        </div>
        <svg ref={svgRef} className="w-full h-full cursor-crosshair" viewBox="0 0 600 400" onMouseMove={(e) => setCursorPos(getSVGCoords(e))} onMouseEnter={() => setIsHoveringMap(true)} onMouseLeave={() => { setIsHoveringMap(false); setCursorPos(null); }} onClick={(e) => { const coords = getSVGCoords(e); const label = waypoints.length === 0 ? "Start" : waypoints.length === 1 ? "Via" : `Via ${waypoints.length}`; setWaypoints([...waypoints, { ...coords, label }]); }}>
          <defs>
            <pattern id="wgrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(12,122,141,0.08)" strokeWidth="0.5" /></pattern>
            <pattern id="wgridL" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(12,122,141,0.12)" strokeWidth="1" /></pattern>
          </defs>
          <rect width="600" height="400" fill="#EFF7F9" />
          <rect width="600" height="400" fill="url(#wgrid)" />
          <rect width="600" height="400" fill="url(#wgridL)" />
          <g opacity="0.25">
            <path d="M0,200 L600,200" stroke="#9BBFC8" strokeWidth="6" strokeLinecap="round" />
            <path d="M300,0 L300,400" stroke="#9BBFC8" strokeWidth="6" strokeLinecap="round" />
            <path d="M0,100 L600,100" stroke="#B8D4DA" strokeWidth="3" />
            <path d="M0,300 L600,300" stroke="#B8D4DA" strokeWidth="3" />
            <path d="M150,0 L150,400" stroke="#B8D4DA" strokeWidth="3" />
            <path d="M450,0 L450,400" stroke="#B8D4DA" strokeWidth="3" />
            <path d="M0,150 Q200,140 300,160 Q400,180 600,150" stroke="#C8DDE3" strokeWidth="2" />
            <path d="M0,250 Q150,260 300,240 Q450,220 600,250" stroke="#C8DDE3" strokeWidth="2" />
          </g>
          {waypointPath && <path d={waypointPath} fill="none" stroke="#0C7A8D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          {waypoints.map((wp, i) => (
            <g key={i}>
              {i === 0 ? (<><circle cx={wp.x} cy={wp.y} r="14" fill="#0C7A8D" opacity="0.15" /><circle cx={wp.x} cy={wp.y} r="8" fill="#0C7A8D" /><circle cx={wp.x} cy={wp.y} r="3" fill="white" /></>) : (<><circle cx={wp.x} cy={wp.y} r="10" fill="#12B5C9" opacity="0.2" /><circle cx={wp.x} cy={wp.y} r="6" fill="#12B5C9" /><circle cx={wp.x} cy={wp.y} r="2" fill="white" /></>)}
            </g>
          ))}
          {isHoveringMap && cursorPos && (
            <g style={{ pointerEvents: "none" }}>
              <rect x={Math.min(cursorPos.x + 12, 420)} y={cursorPos.y - 28} width={waypoints.length === 0 ? 188 : 140} height="24" rx="6" fill="#1A2332" opacity="0.88" />
              <text x={Math.min(cursorPos.x + 20, 428)} y={cursorPos.y - 12} fontSize="10" fill="white" style={{ fontFamily: "'Inter', sans-serif" }}>{waypoints.length === 0 ? "Click to place your starting waypoint" : "Click to add a waypoint"}</text>
            </g>
          )}
        </svg>
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 flex items-center gap-3">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#0C7A8D]" /><span className="text-[10px] text-muted-foreground">Start</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#12B5C9]" /><span className="text-[10px] text-muted-foreground">Waypoint</span></div>
        </div>
      </div>
    </div>
  );
}

function Step2({ difficulty, setDifficulty, duration, setDuration, selectedSkills, setSelectedSkills, routeType, setRouteType }: { difficulty: number; setDifficulty: (v: number) => void; duration: string; setDuration: (v: string) => void; selectedSkills: string[]; setSelectedSkills: (v: string[]) => void; routeType: string; setRouteType: (v: string) => void }) {
  const toggle = (skill: string) => setSelectedSkills(selectedSkills.includes(skill) ? selectedSkills.filter((s) => s !== skill) : [...selectedSkills, skill]);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-7">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div><label className="text-sm font-semibold text-foreground block" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Difficulty Tier</label><p className="text-xs text-muted-foreground mt-0.5">How challenging is this route for a new driver?</p></div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">{Array.from({ length: 5 }).map((_, i) => (<button key={i} onClick={() => setDifficulty(i + 1)} className={`w-7 h-7 rounded-lg border transition-all duration-150 flex items-center justify-center text-xs font-bold ${i < difficulty ? "bg-[#0C7A8D] border-[#0C7A8D] text-white" : "bg-background border-border text-muted-foreground hover:border-[#0C7A8D]/40"}`}>{i + 1}</button>))}</div>
            <span className="text-sm font-semibold text-[#0C7A8D] min-w-[90px]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{difficultyLabels[difficulty]}</span>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${(difficulty / 5) * 100}%`, background: "linear-gradient(to right, #0C7A8D, #12B5C9)" }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div><label className="text-sm font-semibold text-foreground block mb-1.5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Estimated Duration</label><div className="relative"><input type="number" min="5" max="180" className={inputCls + " pr-14"} placeholder="30" value={duration} onChange={(e) => setDuration(e.target.value)} /><span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>min</span></div></div>
        <div><label className="text-sm font-semibold text-foreground block mb-1.5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Route Environment</label><div className="relative"><select className={selectCls} value={routeType} onChange={(e) => setRouteType(e.target.value)}><option value="">Select type…</option><option>Residential / Suburban</option><option>Urban / Downtown</option><option>Highway / Freeway</option><option>Mixed Terrain</option><option>Rural / Back Roads</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" /></div></div>
      </div>
      <div>
        <label className="text-sm font-semibold text-foreground block mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Core Skills Taught</label>
        <p className="text-xs text-muted-foreground mb-3">Select all that apply — these appear as searchable tags on your route.</p>
        <div className="flex flex-wrap gap-2">
          {allSkills.map((skill) => { const active = selectedSkills.includes(skill); return (<button key={skill} onClick={() => toggle(skill)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 ${active ? "bg-[#0C7A8D] border-[#0C7A8D] text-white shadow-sm" : "bg-background border-border text-muted-foreground hover:border-[#0C7A8D]/40 hover:text-foreground"}`}>{active && <CheckCircle2 size={11} />}{skill}</button>); })}
        </div>
        {selectedSkills.length > 0 && <p className="mt-3 text-xs text-[#0C7A8D] font-medium">{selectedSkills.length} skill{selectedSkills.length !== 1 ? "s" : ""} selected</p>}
      </div>
    </div>
  );
}

function Step3({ safetyNotes, setSafetyNotes, agreedToGuidelines, setAgreedToGuidelines, routeTitle, difficulty, duration, selectedSkills }: { safetyNotes: string; setSafetyNotes: (v: string) => void; agreedToGuidelines: boolean; setAgreedToGuidelines: (v: boolean) => void; routeTitle: string; difficulty: number; duration: string; selectedSkills: string[] }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex gap-0 h-full">
        <div className="flex-1 px-6 py-6 space-y-5 border-r border-border overflow-y-auto">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Parent-to-Parent Safety Tips & Disclaimers</label>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Share what you wish you'd known before driving this route.</p>
            <textarea rows={7} className={inputCls + " resize-none leading-relaxed"} placeholder="e.g., Avoid this route between 3 PM and 4 PM due to school bus congestion. Great for teaching yielding at the corner blind spot." value={safetyNotes} onChange={(e) => setSafetyNotes(e.target.value)} />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px] text-muted-foreground">Markdown supported</p>
              <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{safetyNotes.length} / 1200</p>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Known Hazards or Considerations</label>
            <div className="space-y-2">
              {["Railroad crossing present", "School zone on route", "Construction zone (seasonal)", "Poor lighting after dark", "Steep grade / hills"].map((item) => (<label key={item} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted/40 cursor-pointer transition-colors"><input type="checkbox" className="w-4 h-4 rounded border-border accent-[#0C7A8D] cursor-pointer" /><span className="text-sm text-foreground">{item}</span></label>))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded border-border accent-[#0C7A8D] mt-0.5 cursor-pointer" checked={agreedToGuidelines} onChange={(e) => setAgreedToGuidelines(e.target.checked)} />
              <div>
                <p className="text-sm font-medium text-foreground leading-snug">I confirm this route complies with <span className="text-[#0C7A8D] underline underline-offset-2">DriveReady Community Guidelines</span></p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Routes are reviewed by moderators within 48 hours.</p>
              </div>
            </label>
          </div>
        </div>
        <div className="w-[260px] flex-shrink-0 px-5 py-6 bg-muted/30 overflow-y-auto">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}><BookOpen size={14} className="text-[#0C7A8D]" />Route Summary</h3>
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Route Name</p><p className="text-sm font-semibold text-foreground leading-snug" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{routeTitle || <span className="text-muted-foreground font-normal italic">Untitled Route</span>}</p></div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Difficulty</p><DifficultyDots level={difficulty} /></div>
                <div><p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Duration</p><p className="text-sm font-medium text-foreground">{duration ? `${duration} min` : "—"}</p></div>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Skills</p>
                {selectedSkills.length > 0 ? (<div className="flex flex-wrap gap-1.5">{selectedSkills.slice(0, 5).map((s) => (<span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[#E4EFF2] text-[#0C7A8D] font-medium border border-[#0C7A8D]/15">{s}</span>))}{selectedSkills.length > 5 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">+{selectedSkills.length - 5}</span>}</div>) : <p className="text-xs text-muted-foreground italic">No skills selected</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Publish Checklist</p>
              <div className="space-y-1.5">
                {[{ label: "Route title set", done: !!routeTitle }, { label: "Difficulty selected", done: difficulty > 0 }, { label: "Skills tagged", done: selectedSkills.length > 0 }, { label: "Safety notes added", done: safetyNotes.length > 20 }, { label: "Guidelines agreed", done: agreedToGuidelines }].map((item) => (<div key={item.label} className="flex items-center gap-2"><div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? "bg-[#0C7A8D]" : "bg-muted border border-border"}`}>{item.done && <CheckCircle2 size={10} className="text-white" strokeWidth={2.5} />}</div><span className={`text-xs ${item.done ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span></div>))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RouteWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [routeTitle, setRouteTitle] = useState("");
  const [landmark, setLandmark] = useState("");
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [difficulty, setDifficulty] = useState(2);
  const [duration, setDuration] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [routeType, setRouteType] = useState("");
  const [safetyNotes, setSafetyNotes] = useState("");
  const [agreedToGuidelines, setAgreedToGuidelines] = useState(false);
  const canAdvance = step === 1 ? routeTitle.trim().length > 0 : step === 2 ? selectedSkills.length > 0 : agreedToGuidelines;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/30" style={{ backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="fixed z-50 bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(960px, calc(100vw - 48px))", height: "min(680px, calc(100vh - 80px))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] flex items-center justify-center"><Navigation size={15} className="text-white" /></div>
            <div><h2 className="text-base font-bold text-foreground leading-none" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Publish a New Route</h2><p className="text-xs text-muted-foreground mt-0.5">Share a supervised driving route with the DriveReady community</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><X size={15} /></button>
        </div>
        <div className="flex-shrink-0 flex items-stretch border-b border-border bg-muted/20">
          {wizardSteps.map((s, i) => { const isActive = step === s.id; const isDone = step > s.id; return (<button key={s.id} onClick={() => isDone && setStep(s.id)} className={`flex-1 flex items-center gap-3 px-5 py-3.5 transition-all duration-150 relative ${isActive ? "bg-card" : isDone ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"}`}>{isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#0C7A8D] to-[#12B5C9]" />}<div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${isDone ? "bg-[#0C7A8D] text-white" : isActive ? "bg-[#0C7A8D] text-white" : "bg-muted text-muted-foreground border border-border"}`}>{isDone ? <CheckCircle2 size={13} strokeWidth={2.5} /> : s.id}</div><div className="text-left"><p className={`text-xs font-semibold leading-none ${isActive ? "text-foreground" : isDone ? "text-foreground" : "text-muted-foreground"}`} style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{s.label}</p><p className="text-[10px] text-muted-foreground mt-0.5 leading-none">{s.desc}</p></div>{i < wizardSteps.length - 1 && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-8 bg-border" />}</button>); })}
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {step === 1 && <Step1 routeTitle={routeTitle} setRouteTitle={setRouteTitle} landmark={landmark} setLandmark={setLandmark} waypoints={waypoints} setWaypoints={setWaypoints} />}
          {step === 2 && <Step2 difficulty={difficulty} setDifficulty={setDifficulty} duration={duration} setDuration={setDuration} selectedSkills={selectedSkills} setSelectedSkills={setSelectedSkills} routeType={routeType} setRouteType={setRouteType} />}
          {step === 3 && <Step3 safetyNotes={safetyNotes} setSafetyNotes={setSafetyNotes} agreedToGuidelines={agreedToGuidelines} setAgreedToGuidelines={setAgreedToGuidelines} routeTitle={routeTitle} difficulty={difficulty} duration={duration} selectedSkills={selectedSkills} />}
        </div>
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-border bg-card">
          <div className="flex items-center gap-2">
            {step > 1 && <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><ChevronLeft size={15} /> Back</button>}
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">{wizardSteps.map((s) => (<div key={s.id} className={`rounded-full transition-all duration-300 ${step === s.id ? "w-5 h-1.5 bg-[#0C7A8D]" : step > s.id ? "w-1.5 h-1.5 bg-[#12B5C9]" : "w-1.5 h-1.5 bg-muted-foreground/30"}`} />))}</div>
            {step < 3 ? (<button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${canAdvance ? "bg-[#0C7A8D] hover:bg-[#0A6A7B] text-white shadow-sm hover:shadow-md" : "bg-muted text-muted-foreground cursor-not-allowed"}`}>Continue <ChevronRight size={15} /></button>) : (<button className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#0C7A8D] text-white" onClick={onClose}>Close preview</button>)}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Route Explorer ─────────────────────────────────────────────────────────
function RouteExplorer({ onPublish }: { onPublish: () => void }) {
  const [tab, setTab] = useState<"community" | "mine">("community");
  const [search, setSearch] = useState("");
  const [filterDiff, setFilterDiff] = useState<number | null>(null);
  const [filterDuration, setFilterDuration] = useState<"" | "short" | "medium" | "long">("");
  const [filterEnv, setFilterEnv] = useState<"" | ExplorerRoute["environment"]>("");
  const [selectedId, setSelectedId] = useState<string | null>("er1");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(["er2"]));
  const [mapZoom, setMapZoom] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let list = explorerRoutes.filter((r) => tab === "mine" ? r.mine : !r.mine);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.neighborhood.toLowerCase().includes(q) || r.skills.some((s) => s.toLowerCase().includes(q)));
    }
    if (filterDiff !== null) list = list.filter((r) => r.difficulty === filterDiff);
    if (filterDuration === "short") list = list.filter((r) => r.durationMin <= 35);
    if (filterDuration === "medium") list = list.filter((r) => r.durationMin > 35 && r.durationMin <= 55);
    if (filterDuration === "long") list = list.filter((r) => r.durationMin > 55);
    if (filterEnv) list = list.filter((r) => r.environment === filterEnv);
    return list;
  }, [tab, search, filterDiff, filterDuration, filterEnv]);

  const selected = explorerRoutes.find((r) => r.id === selectedId);
  const hovered = explorerRoutes.find((r) => r.id === hoveredId);
  const highlighted = hovered ?? selected;

  const toggleSave = (id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeFiltersCount = (filterDiff !== null ? 1 : 0) + (filterDuration ? 1 : 0) + (filterEnv ? 1 : 0);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Left pane ──────────────────────────────────────────────────── */}
      <div className="flex flex-col border-r border-border bg-card overflow-hidden" style={{ width: "35%" }}>
        {/* Top controls */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-border">
          {/* Publish CTA */}
          <button
            onClick={onPublish}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0C7A8D] hover:bg-[#0A6A7B] text-white text-sm font-semibold transition-all duration-150 shadow-sm hover:shadow-md"
          >
            <Plus size={16} />
            Publish a New Route
          </button>

          {/* Tab switcher */}
          <div className="flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
            <button
              onClick={() => setTab("community")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${tab === "community" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Users size={12} />
              Explore Community
            </button>
            <button
              onClick={() => setTab("mine")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${tab === "mine" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <UserCircle2 size={12} />
              My Created Routes
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#0C7A8D] focus:ring-2 focus:ring-[#0C7A8D]/15 hover:border-[#0C7A8D]/40 transition-all duration-150"
              placeholder="Search by zip code, school, or skill..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${showFilters || activeFiltersCount > 0 ? "border-[#0C7A8D] bg-[#E4EFF2] text-[#0C7A8D]" : "border-border text-muted-foreground hover:border-[#0C7A8D]/40 hover:text-foreground"}`}
            >
              <SlidersHorizontal size={12} />
              Filters
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-[#0C7A8D] text-white text-[9px] font-bold flex items-center justify-center">{activeFiltersCount}</span>
              )}
            </button>
            {/* Quick difficulty filter chips */}
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                onClick={() => setFilterDiff(filterDiff === d ? null : d)}
                className={`w-7 h-7 rounded-lg border text-xs font-bold transition-all duration-150 flex-shrink-0 ${filterDiff === d ? "bg-[#0C7A8D] border-[#0C7A8D] text-white" : "border-border text-muted-foreground hover:border-[#0C7A8D]/40"}`}
              >
                {d}
              </button>
            ))}
            {activeFiltersCount > 0 && (
              <button onClick={() => { setFilterDiff(null); setFilterDuration(""); setFilterEnv(""); }} className="ml-auto text-[10px] text-muted-foreground hover:text-red-500 transition-colors whitespace-nowrap">
                Clear all
              </button>
            )}
          </div>

          {/* Expanded filter panel */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="relative">
                <select className={selectCls + " text-xs py-2 pl-3"} value={filterDuration} onChange={(e) => setFilterDuration(e.target.value as typeof filterDuration)}>
                  <option value="">Any Duration</option>
                  <option value="short">Short (≤35 min)</option>
                  <option value="medium">Medium (36–55 min)</option>
                  <option value="long">Long (55+ min)</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select className={selectCls + " text-xs py-2 pl-3"} value={filterEnv} onChange={(e) => setFilterEnv(e.target.value as typeof filterEnv)}>
                  <option value="">Any Environment</option>
                  <option value="Residential">Residential</option>
                  <option value="Urban">Urban</option>
                  <option value="Highway">Highway</option>
                  <option value="Mixed">Mixed</option>
                  <option value="Rural">Rural</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* Results count */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-muted/20 border-b border-border">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> route{filtered.length !== 1 ? "s" : ""} found
          </span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Sort:</span>
            <button className="font-medium text-[#0C7A8D] hover:underline">Most Popular</button>
          </div>
        </div>

        {/* Route list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <Route size={32} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">No routes found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or search terms</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((route) => {
                const isSelected = selectedId === route.id;
                const dc = difficultyColor(route.difficulty);
                const isSaved = savedIds.has(route.id);
                return (
                  <div
                    key={route.id}
                    onClick={() => setSelectedId(route.id)}
                    onMouseEnter={() => setHoveredId(route.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`px-4 py-4 cursor-pointer transition-all duration-150 relative ${isSelected ? "bg-[#E4EFF2]/50" : "hover:bg-muted/30"}`}
                  >
                    {/* Selected accent bar */}
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#0C7A8D] rounded-r" />}

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground leading-snug" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{route.title}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <MapPin size={10} className="text-muted-foreground flex-shrink-0" />
                          <span className="text-[11px] text-muted-foreground truncate">{route.neighborhood}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSave(route.id); }}
                        className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${isSaved ? "text-[#0C7A8D] bg-[#E4EFF2]" : "text-muted-foreground hover:text-[#0C7A8D] hover:bg-[#E4EFF2]/50"}`}
                      >
                        <Heart size={13} fill={isSaved ? "currentColor" : "none"} />
                      </button>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* Difficulty badge */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border" style={{ backgroundColor: dc.bg, color: dc.text, borderColor: dc.border }}>
                        Lvl {route.difficulty} · {difficultyLabels[route.difficulty]}
                      </span>
                      {/* Duration */}
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <Clock size={10} /> {route.durationMin} min
                      </span>
                      {/* Environment */}
                      <span className="text-[11px] text-muted-foreground">{envIcon(route.environment)} {route.environment}</span>
                    </div>

                    {/* Skills */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {route.skills.slice(0, 2).map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">{s}</span>
                      ))}
                      {route.skills.length > 2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">+{route.skills.length - 2}</span>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 mt-2.5">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={9} fill={i < Math.round(route.rating) ? "#F59E0B" : "none"} className={i < Math.round(route.rating) ? "text-amber-400" : "text-gray-300"} />
                        ))}
                        <span className="ml-1 text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{route.rating}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1"><ThumbsUp size={9} /> {route.drives} drives</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] flex items-center justify-center text-white text-[7px] font-bold">{route.authorInitials[0]}</div>
                        <span className="text-[10px] text-muted-foreground">{route.author}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right pane: Map ─────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden bg-[#E8F2F5]">
        {/* Map SVG */}
        <svg
          viewBox="0 0 480 360"
          className="w-full h-full"
          style={{ transform: `scale(${mapZoom})`, transformOrigin: "center", transition: "transform 0.2s ease" }}
        >
          <defs>
            <pattern id="explorerGrid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(12,122,141,0.06)" strokeWidth="0.5" />
            </pattern>
            <pattern id="explorerGridLg" width="90" height="90" patternUnits="userSpaceOnUse">
              <path d="M 90 0 L 0 0 0 90" fill="none" stroke="rgba(12,122,141,0.10)" strokeWidth="0.8" />
            </pattern>
            <filter id="pinShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0,0,0,0.18)" />
            </filter>
            <filter id="selectedGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#0C7A8D" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Base */}
          <rect width="480" height="360" fill="#E8F2F5" />
          <rect width="480" height="360" fill="url(#explorerGrid)" />
          <rect width="480" height="360" fill="url(#explorerGridLg)" />

          {/* Savannah River (north) */}
          <path d="M0,42 Q60,35 120,48 Q180,58 240,44 Q300,32 360,46 Q420,58 480,40" fill="#BDD8E0" opacity="0.6" />
          <path d="M0,42 Q60,35 120,48 Q180,58 240,44 Q300,32 360,46 Q420,58 480,40 L480,0 L0,0 Z" fill="#D0E8EE" opacity="0.5" />
          <text x="195" y="28" fontSize="7" fill="#6B9DAE" fontWeight="500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>SAVANNAH RIVER</text>

          {/* Highway network */}
          {/* I-20 (major east-west) */}
          <path d="M0,232 L480,232" stroke="#B8D0D8" strokeWidth="7" strokeLinecap="round" />
          <path d="M0,232 L480,232" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 8" />
          <text x="430" y="227" fontSize="6.5" fill="#6B8090" fontWeight="700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>I-20</text>

          {/* Bobby Jones Expressway (north-south) */}
          <path d="M245,0 L245,360" stroke="#B8D0D8" strokeWidth="6" strokeLinecap="round" />
          <path d="M245,0 L245,360" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 7" />
          <text x="248" y="78" fontSize="6.5" fill="#6B8090" fontWeight="700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>BJ Expwy</text>

          {/* I-520 (south arc) */}
          <path d="M60,360 Q120,290 200,280 Q280,270 360,295 Q420,310 460,360" fill="none" stroke="#B8D0D8" strokeWidth="5" />
          <path d="M60,360 Q120,290 200,280 Q280,270 360,295 Q420,310 460,360" fill="none" stroke="white" strokeWidth="2" strokeDasharray="12 6" />
          <text x="190" y="270" fontSize="6.5" fill="#6B8090" fontWeight="700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>I-520</text>

          {/* Riverwatch Pkwy */}
          <path d="M180,60 Q220,70 260,80 Q300,90 330,110 L350,135" fill="none" stroke="#C8DCE4" strokeWidth="4" strokeLinecap="round" />

          {/* Washington Road */}
          <path d="M0,215 Q80,210 160,212 Q200,213 245,215" fill="none" stroke="#C0D4DC" strokeWidth="4" strokeLinecap="round" />

          {/* Secondary roads grid */}
          <g stroke="#CCDEE6" strokeWidth="2" fill="none" opacity="0.7">
            <line x1="100" y1="60" x2="100" y2="280" />
            <line x1="155" y1="55" x2="155" y2="290" />
            <line x1="195" y1="60" x2="195" y2="285" />
            <line x1="300" y1="55" x2="300" y2="290" />
            <line x1="350" y1="60" x2="350" y2="280" />
            <line x1="400" y1="65" x2="400" y2="275" />
            <line x1="0" y1="110" x2="480" y2="110" />
            <line x1="0" y1="160" x2="480" y2="160" />
            <line x1="0" y1="185" x2="480" y2="185" />
            <line x1="0" y1="260" x2="480" y2="260" />
            <line x1="0" y1="310" x2="480" y2="310" />
          </g>

          {/* Tertiary roads */}
          <g stroke="#D8E8EE" strokeWidth="1.2" fill="none" opacity="0.6">
            <line x1="70" y1="60" x2="70" y2="300" />
            <line x1="130" y1="60" x2="130" y2="300" />
            <line x1="170" y1="60" x2="170" y2="300" />
            <line x1="220" y1="60" x2="220" y2="300" />
            <line x1="270" y1="60" x2="270" y2="300" />
            <line x1="320" y1="60" x2="320" y2="300" />
            <line x1="370" y1="60" x2="370" y2="300" />
            <line x1="430" y1="60" x2="430" y2="300" />
            <line x1="0" y1="80" x2="480" y2="80" />
            <line x1="0" y1="135" x2="480" y2="135" />
            <line x1="0" y1="205" x2="480" y2="205" />
            <line x1="0" y1="240" x2="480" y2="240" />
            <line x1="0" y1="280" x2="480" y2="280" />
            <line x1="0" y1="335" x2="480" y2="335" />
          </g>

          {/* Block fills */}
          <g fill="#D4E8EE" opacity="0.45">
            <rect x="105" y="115" width="45" height="40" rx="2" />
            <rect x="160" y="115" width="30" height="40" rx="2" />
            <rect x="105" y="165" width="35" height="35" rx="2" />
            <rect x="250" y="115" width="45" height="40" rx="2" />
            <rect x="305" y="115" width="40" height="40" rx="2" />
            <rect x="355" y="115" width="40" height="40" rx="2" />
            <rect x="250" y="165" width="40" height="35" rx="2" />
            <rect x="305" y="165" width="35" height="35" rx="2" />
            <rect x="355" y="165" width="38" height="35" rx="2" />
            <rect x="105" y="245" width="45" height="30" rx="2" />
            <rect x="160" y="245" width="30" height="30" rx="2" />
            <rect x="250" y="245" width="45" height="30" rx="2" />
            <rect x="305" y="245" width="40" height="30" rx="2" />
          </g>

          {/* Neighborhood labels */}
          {[
            { x: 72, y: 142, label: "Evans" },
            { x: 135, y: 105, label: "Martinez" },
            { x: 270, y: 105, label: "Augusta" },
            { x: 355, y: 142, label: "Grovetown" },
            { x: 58, y: 248, label: "Aiken, SC" },
            { x: 330, y: 262, label: "Ft. Eisenhower" },
          ].map(({ x, y, label }) => (
            <text key={label} x={x} y={y} fontSize="7" fill="#7CA8B5" fontWeight="600" textAnchor="middle" style={{ fontFamily: "'Inter', sans-serif" }}>{label}</text>
          ))}

          {/* Highlighted route path (selected/hovered) */}
          {highlighted && (
            <path
              d={highlighted.pathD}
              fill="none"
              stroke={pinColor(highlighted.difficulty)}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="0"
              opacity="0.85"
              filter="url(#selectedGlow)"
            />
          )}

          {/* All route paths (dimmed) */}
          {explorerRoutes.map((r) => {
            if (r.id === highlighted?.id) return null;
            const visible = filtered.some((f) => f.id === r.id);
            return (
              <path
                key={r.id}
                d={r.pathD}
                fill="none"
                stroke={pinColor(r.difficulty)}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={visible ? 0.25 : 0.08}
              />
            );
          })}

          {/* Route pins */}
          {explorerRoutes.map((route) => {
            const isSelected = selectedId === route.id;
            const isHov = hoveredId === route.id;
            const inFilter = filtered.some((f) => f.id === route.id);
            const color = pinColor(route.difficulty);
            const scale = isSelected || isHov ? 1.3 : inFilter ? 1 : 0.7;
            const opacity = inFilter ? 1 : 0.3;
            return (
              <g
                key={route.id}
                transform={`translate(${route.pinX}, ${route.pinY}) scale(${scale})`}
                style={{ transformOrigin: `${route.pinX}px ${route.pinY}px`, transformBox: "fill-box", cursor: "pointer", opacity, transition: "opacity 0.2s, transform 0.15s" }}
                onClick={() => setSelectedId(route.id)}
                onMouseEnter={() => setHoveredId(route.id)}
                onMouseLeave={() => setHoveredId(null)}
                filter={isSelected ? "url(#selectedGlow)" : "url(#pinShadow)"}
              >
                {/* Pin body */}
                <path
                  d="M0,-18 C-7,-18 -12,-13 -12,-7 C-12,2 0,14 0,14 C0,14 12,2 12,-7 C12,-13 7,-18 0,-18 Z"
                  fill={isSelected || isHov ? color : "white"}
                  stroke={color}
                  strokeWidth="2"
                />
                {/* Pin inner dot */}
                <circle cx="0" cy="-7" r="4" fill={isSelected || isHov ? "white" : color} />
                {/* Difficulty number badge (selected only) */}
                {isSelected && (
                  <text x="0" y="-4.5" textAnchor="middle" fontSize="5" fontWeight="700" fill="white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{route.difficulty}</text>
                )}
              </g>
            );
          })}

          {/* Cluster badge (demo — northwest corner) */}
          <g transform="translate(112, 155)">
            <circle cx="0" cy="0" r="14" fill="#0C7A8D" opacity="0.12" />
            <circle cx="0" cy="0" r="9" fill="#0C7A8D" />
            <text x="0" y="3.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>2</text>
          </g>
        </svg>

        {/* Map overlay controls */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          {/* Location chip */}
          <div className="flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-sm">
            <Compass size={13} className="text-[#0C7A8D]" />
            <span className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Augusta Metro, GA</span>
            <span className="text-[10px] text-muted-foreground ml-1">{filtered.length} routes shown</span>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-1.5">
          <button onClick={() => setMapZoom((z) => Math.min(z + 0.15, 2))} className="w-8 h-8 bg-white/95 border border-border rounded-lg flex items-center justify-center shadow-sm hover:bg-muted transition-colors">
            <ZoomIn size={14} className="text-foreground" />
          </button>
          <button onClick={() => setMapZoom((z) => Math.max(z - 0.15, 0.7))} className="w-8 h-8 bg-white/95 border border-border rounded-lg flex items-center justify-center shadow-sm hover:bg-muted transition-colors">
            <ZoomOut size={14} className="text-foreground" />
          </button>
          <button onClick={() => setMapZoom(1)} className="w-8 h-8 bg-white/95 border border-border rounded-lg flex items-center justify-center shadow-sm hover:bg-muted transition-colors">
            <Layers size={14} className="text-foreground" />
          </button>
        </div>

        {/* Difficulty legend */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-border rounded-xl px-3.5 py-2.5 shadow-sm">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Difficulty</p>
          <div className="space-y-1.5">
            {[
              { lvl: 1, label: "Beginner", color: "#0C7A8D" },
              { lvl: 2, label: "Easy", color: "#15803D" },
              { lvl: 3, label: "Moderate", color: "#EA580C" },
              { lvl: "4+", label: "Advanced", color: "#A21CAF" },
            ].map(({ lvl, label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected route detail card */}
        {selected && (
          <div className="absolute bottom-4 right-4 w-72 bg-white/97 backdrop-blur-md border border-border rounded-2xl shadow-xl overflow-hidden">
            {/* Card header accent */}
            <div className="h-1" style={{ background: `linear-gradient(to right, ${pinColor(selected.difficulty)}, #12B5C9)` }} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-foreground leading-snug" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{selected.title}</h3>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin size={10} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-[11px] text-muted-foreground">{selected.neighborhood}</span>
                  </div>
                </div>
                <button onClick={() => toggleSave(selected.id)} className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${savedIds.has(selected.id) ? "text-[#0C7A8D] bg-[#E4EFF2]" : "text-muted-foreground hover:text-[#0C7A8D]"}`}>
                  <Heart size={13} fill={savedIds.has(selected.id) ? "currentColor" : "none"} />
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{selected.description}</p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center bg-muted/40 rounded-lg py-2">
                  <p className="text-sm font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{selected.durationMin}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">minutes</p>
                </div>
                <div className="text-center bg-muted/40 rounded-lg py-2">
                  <p className="text-sm font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{selected.rating}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">rating</p>
                </div>
                <div className="text-center bg-muted/40 rounded-lg py-2">
                  <p className="text-sm font-bold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{selected.drives}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">drives</p>
                </div>
              </div>

              {/* Skills */}
              <div className="flex flex-wrap gap-1 mb-3">
                {selected.skills.map((s) => (
                  <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[#E4EFF2] text-[#0C7A8D] font-medium">{s}</span>
                ))}
              </div>

              {/* Author + CTA */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] flex items-center justify-center text-white text-[8px] font-bold">{selected.authorInitials}</div>
                  <span className="text-[11px] text-muted-foreground">by {selected.author}</span>
                </div>
                <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0C7A8D] hover:bg-[#0A6A7B] text-white text-xs font-semibold transition-colors">
                  Use Route <ArrowUpRight size={11} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
function LegacyApp() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [selectedDriver, setSelectedDriver] = useState<Driver>(drivers[0]);
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [notifCount] = useState(3);
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="flex-shrink-0 flex flex-col bg-card border-r border-border" style={{ width: 228 }}>
        <div className="h-16 flex items-center px-5 border-b border-border gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] flex items-center justify-center flex-shrink-0">
            <Navigation size={14} className="text-white" />
          </div>
          <span className="font-bold text-foreground text-sm tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>DriveReady</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Main</p>
          {navItems.map((item) => {
            const active = activeNav === item.id;
            return (
              <button key={item.id} onClick={() => setActiveNav(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${active ? "bg-[#E4EFF2] text-[#0C7A8D]" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <span className={active ? "text-[#0C7A8D]" : "text-muted-foreground"}>{item.icon}</span>
                {item.label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0C7A8D]" />}
              </button>
            );
          })}
        </nav>
        <div className="px-3 pb-5">
          <div className="rounded-xl bg-gradient-to-br from-[#0C7A8D]/8 to-[#12B5C9]/8 border border-[#0C7A8D]/12 p-3.5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-[#0C7A8D] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-[#0C7A8D]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>TADRA Compliant</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">On track for Georgia license eligibility</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-card border-b border-border">
          <div>
            <h1 className="text-lg font-bold text-foreground leading-none" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {activeNav === "dashboard" ? "Dashboard" : activeNav === "routes" ? "Route Explorer" : activeNav === "logs" ? "Driving Logs" : "State Requirements"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Sunday, July 6, 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setDriverDropdownOpen((v) => !v)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{selectedDriver.initials}</div>
                <span className="font-medium text-foreground">{selectedDriver.name}</span>
                <span className="text-xs text-muted-foreground">Age {selectedDriver.age}</span>
                <ChevronDown size={13} className="text-muted-foreground ml-0.5" />
              </button>
              {driverDropdownOpen && (
                <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-xl shadow-lg py-1.5 z-50 min-w-[200px]">
                  {drivers.map((d) => (
                    <button key={d.id} onClick={() => { setSelectedDriver(d); setDriverDropdownOpen(false); }} className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-muted transition-colors ${selectedDriver.id === d.id ? "text-[#0C7A8D] font-medium" : "text-foreground"}`}>
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#0C7A8D] to-[#12B5C9] flex items-center justify-center text-white text-[10px] font-bold">{d.initials}</div>
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors">
              <Bell size={16} className="text-muted-foreground" />
              {notifCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0C7A8D] text-white text-[9px] font-bold flex items-center justify-center">{notifCount}</span>}
            </button>
            <button onClick={() => setWizardOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0C7A8D] hover:bg-[#0A6A7B] text-white text-sm font-semibold transition-all duration-150 shadow-sm hover:shadow-md">
              <Plus size={15} /> Plan Next Drive
            </button>
          </div>
        </header>

        {/* ── Conditional content ──────────────────────────────────────── */}
        {activeNav === "routes" ? (
          <RouteExplorer onPublish={() => setWizardOpen(true)} />
        ) : (
          <main className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="grid gap-5" style={{ gridTemplateColumns: "300px 1fr" }}>
              {/* Progress Tracker */}
              <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Hours Progress</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Supervised driving total</p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E4EFF2] text-[#0C7A8D] text-[10px] font-semibold border border-[#0C7A8D]/15" style={{ fontFamily: "'JetBrains Mono', monospace" }}><AlertCircle size={9} /> 16 hrs left</span>
                </div>
                <div className="flex justify-center"><CircularProgressRing value={24} max={40} /></div>
                <div className="space-y-4">
                  <SubProgressBar label="Day Driving" value={20} max={34} color="#0C7A8D" />
                  <SubProgressBar label="Night Driving" value={4} max={6} color="#12B5C9" />
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <CheckCircle2 size={13} className="text-[#0C7A8D] flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground leading-snug"><span className="font-semibold text-foreground">Georgia</span> — TADRA / Joshua's Law</span>
                </div>
              </div>

              {/* Drive Logs */}
              <div className="bg-card rounded-2xl border border-border flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Recent Drive Logs</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Last 5 supervised sessions</p>
                  </div>
                  <button className="text-xs font-medium text-[#0C7A8D] hover:underline flex items-center gap-1 transition-colors">View all <ChevronRight size={12} /></button>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-border bg-muted/50">
                        {["Date", "Route", "Duration", "Skills Practiced"].map((h) => (
                          <th key={h} className="text-left px-5 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {driveLogs.map((log, i) => (
                        <tr key={i} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                          <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{log.date}</td>
                          <td className="px-4 py-3.5"><span className="font-medium text-foreground text-sm">{log.route}</span></td>
                          <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            <span className="inline-flex items-center gap-1"><Clock size={11} />{log.duration}</span>
                          </td>
                          <td className="px-4 py-3.5"><div className="flex flex-wrap gap-1.5">{log.skills.map((s) => <SkillTag key={s} label={s} />)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Recommended Routes */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
                <div>
                  <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Recommended Local Routes</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Crowdsourced routes near Atlanta, GA — filtered for supervised learners</p>
                </div>
                <button onClick={() => setActiveNav("routes")} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <Map size={14} /> Browse all routes
                </button>
              </div>
              <div className="p-5 grid gap-3" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                {dashRoutes.map((route) => (
                  <div key={route.id} onMouseEnter={() => setHoveredRoute(route.id)} onMouseLeave={() => setHoveredRoute(null)} className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-150 cursor-pointer ${hoveredRoute === route.id ? "border-[#0C7A8D]/30 bg-[#E4EFF2]/30 shadow-sm" : "border-border bg-background/60"}`}>
                    <MapPlaceholder color={route.mapColor} routeId={route.id} />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground leading-snug" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{route.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{route.subtitle}</p>
                      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                        <DifficultyDots level={route.difficulty} />
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}><Clock size={11} />{route.duration}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2.5">{route.tags.map((tag) => <span key={tag} className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">{tag}</span>)}</div>
                    </div>
                    <ChevronRight size={15} className={`flex-shrink-0 mt-0.5 transition-colors ${hoveredRoute === route.id ? "text-[#0C7A8D]" : "text-muted-foreground/40"}`} />
                  </div>
                ))}
              </div>
              <div className="px-5 pb-4 flex items-center gap-2">
                <div className="flex items-center gap-0.5">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={11} fill={i < 4 ? "#F59E0B" : "none"} className={i < 4 ? "text-amber-400" : "text-gray-300"} />)}</div>
                <span className="text-xs text-muted-foreground">Routes verified by 4.1k+ local driving supervisors in the Atlanta metro area</span>
              </div>
            </div>
          </main>
        )}
      </div>

      {/* Dropdown backdrop */}
      {driverDropdownOpen && <div className="fixed inset-0 z-40" onClick={() => setDriverDropdownOpen(false)} />}

      {/* Route Wizard modal */}
      {wizardOpen && <RouteWizard onClose={() => setWizardOpen(false)} />}
    </div>
  );
}

export default function App() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [wizardOpen, setWizardOpen] = useState(false);
  const title = navItems.find((item) => item.id === activeNav)?.label ?? "Dashboard";

  return <div className="flex h-screen w-screen overflow-hidden bg-background" style={{ fontFamily: "'Inter', sans-serif" }}>
    <aside className="flex w-16 flex-shrink-0 flex-col border-r border-border bg-card sm:w-52">
      <div className="flex h-16 items-center gap-2 border-b border-border px-4 font-bold text-[#0C7A8D]"><Navigation size={20} /><span className="hidden sm:inline">DriveReady</span></div>
      <nav aria-label="Main navigation" className="space-y-1 p-2 sm:p-3">
        {navItems.map((item) => <button key={item.id} title={item.label} aria-label={item.label} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => setActiveNav(item.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium ${activeNav === item.id ? "bg-[#E4EFF2] text-[#0C7A8D]" : "text-muted-foreground hover:bg-muted"}`}>
          {item.icon}<span className="hidden sm:inline">{item.label}</span>
        </button>)}
      </nav>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-16 flex-shrink-0 items-center border-b border-border bg-card px-5"><h1 className="text-lg font-bold">{title}</h1></header>
      {activeNav === "routes" ? <>
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"><strong>Design preview:</strong> These Augusta-area routes, maps, ratings, and safety notes are fictional examples. They are not location-aware or suitable for navigation. Route creation is a preview and does not save or publish.</div>
        <RouteExplorer onPublish={() => setWizardOpen(true)} />
      </> : activeNav === "requirements" ? <StateRequirements /> : <WorkspaceSwitcher showAll={activeNav === "logs"} />}
    </div>
    {wizardOpen && <RouteWizard onClose={() => setWizardOpen(false)} />}
  </div>;
}

// Visual building blocks carried over from the original Figma dashboard design.
// Keep page components focused on data and behaviour; reuse these for the look.
import type { ReactNode } from "react";
import { decodeRoutePolyline } from "./routePolyline";
import type { RoutePoint } from "./RouteMap";

export const heading = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
export const mono = { fontFamily: "'JetBrains Mono', monospace" };

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-2xl border border-border bg-card ${className}`} {...rest}>{children}</section>;
}

export function CardHeader({ title, subtitle, action, divided = false }: { title: string; subtitle?: string; action?: ReactNode; divided?: boolean }) {
  return <div className={`flex items-start justify-between gap-3 px-5 pb-4 pt-5 ${divided ? "border-b border-border" : ""}`}>
    <div className="min-w-0"><h2 className="text-base font-bold text-foreground" style={heading}>{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}</div>
    {action}
  </div>;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[#0C7A8D]/15 bg-[#E4EFF2] px-2 py-0.5 text-[10px] font-semibold text-[#0C7A8D]" style={mono}>{children}</span>;
}

// One stable colour per catalogue label, as in the Figma skill chips.
const tagColours: Record<string, string> = {
  "Starting and stopping": "bg-teal-50 text-teal-700 border-teal-100",
  "Turns": "bg-cyan-50 text-cyan-700 border-cyan-100",
  "Intersections": "bg-orange-50 text-orange-700 border-orange-100",
  "Lane changes": "bg-indigo-50 text-indigo-700 border-indigo-100",
  "Parking": "bg-violet-50 text-violet-700 border-violet-100",
  "Backing up": "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100",
  "Highway merging": "bg-blue-50 text-blue-700 border-blue-100",
  "Roundabouts": "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Night driving": "bg-slate-100 text-slate-700 border-slate-200",
  "Residential roads": "bg-amber-50 text-amber-700 border-amber-100",
  "City traffic": "bg-rose-50 text-rose-700 border-rose-100",
  "Highway": "bg-blue-50 text-blue-700 border-blue-100",
  "Rural roads": "bg-lime-50 text-lime-700 border-lime-100",
  "Light traffic": "bg-green-50 text-green-700 border-green-100",
  "Heavy traffic": "bg-red-50 text-red-700 border-red-100",
  "Rain": "bg-sky-50 text-sky-700 border-sky-100",
};
export function SkillTag({ label, count, muted = false }: { label: string; count?: number; muted?: boolean }) {
  const colour = muted ? "bg-card text-muted-foreground border-dashed border-[#B4C5D0]" : tagColours[label] ?? "bg-gray-50 text-gray-600 border-gray-100";
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${colour}`} style={mono}>{label}{count ? <span className="opacity-60">×{count}</span> : null}</span>;
}

export function ProgressRing({ value, max, unit = "hrs" }: { value: number; max: number; unit?: string }) {
  const r = 72, circ = 2 * Math.PI * r, share = max > 0 ? Math.min(value / max, 1) : 0;
  const shown = Number.isInteger(value) ? value : value.toFixed(1);
  return <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }} role="img" aria-label={`${shown} of ${max} ${unit}`}>
    <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90" aria-hidden="true">
      <circle cx="90" cy="90" r={r} fill="none" stroke="#E4EFF2" strokeWidth="12" />
      <circle cx="90" cy="90" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="12" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - share)} style={{ transition: "stroke-dashoffset 1s ease" }} />
      <defs><linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#0C7A8D" /><stop offset="100%" stopColor="#12B5C9" /></linearGradient></defs>
    </svg>
    <div className="absolute flex flex-col items-center" aria-hidden="true">
      <span className="text-3xl font-bold text-[#0C7A8D]" style={{ ...heading, lineHeight: 1 }}>{shown}</span>
      <span className="mt-0.5 text-xs text-muted-foreground" style={mono}>/ {max} {unit}</span>
      <span className="mt-1 text-xs font-medium text-[#12B5C9]">{Math.round(share * 100)}%</span>
    </div>
  </div>;
}

export function ProgressBar({ label, value, max, colour, unit = "hrs" }: { label: string; value: number; max: number; colour: string; unit?: string }) {
  const shown = Number.isInteger(value) ? value : value.toFixed(1);
  return <div className="space-y-1.5">
    <div className="flex items-center justify-between"><span className="text-sm font-medium text-foreground">{label}</span><span className="text-xs text-muted-foreground" style={mono}>{shown}/{max} {unit}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`, backgroundColor: colour }} /></div>
  </div>;
}

// A tile-free sketch of a saved route, styled like the Figma map thumbnails.
// It draws only the stored geometry, so no location is sent to a tile provider.
export function RouteSketch({ geometry, roadPolyline, width = 96, height = 68, label }: { geometry?: RoutePoint[]; roadPolyline?: string; width?: number; height?: number; label: string }) {
  let points: RoutePoint[] = [];
  try { points = roadPolyline ? decodeRoutePolyline(roadPolyline) : Array.isArray(geometry) ? geometry : []; } catch { points = Array.isArray(geometry) ? geometry : []; }
  points = points.filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng));
  const pad = 9;
  let path = "", startPoint: [number, number] | null = null, endPoint: [number, number] | null = null;
  if (points.length >= 2) {
    const lats = points.map((p) => p.lat), lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const spanX = Math.max((maxLng - minLng) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offX = (width - spanX * scale) / 2, offY = (height - spanY * scale) / 2;
    const xy = points.map((p) => [offX + (p.lng - minLng) * kx * scale, height - offY - (p.lat - minLat) * scale] as [number, number]);
    path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    startPoint = xy[0]; endPoint = xy[xy.length - 1];
  }
  return <div className="relative flex-shrink-0 overflow-hidden rounded-lg bg-[#E4EFF2]" style={{ width, height }} role="img" aria-label={label}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0" aria-hidden="true">
      {[1, 2].map((i) => <line key={`h${i}`} x1="0" y1={(height / 3) * i} x2={width} y2={(height / 3) * i} stroke="rgba(0,0,0,0.06)" />)}
      {[1, 2].map((i) => <line key={`v${i}`} x1={(width / 3) * i} y1="0" x2={(width / 3) * i} y2={height} stroke="rgba(0,0,0,0.06)" />)}
      {path && <path d={path} fill="none" stroke="#0C7A8D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {startPoint && <circle cx={startPoint[0]} cy={startPoint[1]} r="3.5" fill="#0C7A8D" />}
      {endPoint && <circle cx={endPoint[0]} cy={endPoint[1]} r="3.5" fill="#12B5C9" />}
    </svg>
  </div>;
}

export const primaryButton = "inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#0C7A8D] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#0A6A7B] hover:shadow-md disabled:opacity-50";
export const dangerButton = "inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-red-200 bg-card px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50";
export const ghostButton = "inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

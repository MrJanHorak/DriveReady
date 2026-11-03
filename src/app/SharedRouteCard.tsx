import { useEffect, useRef, useState } from "react";
import { Map, ChevronDown } from "lucide-react";
import { readSharedRoute } from "./sharedAccessEmulator";

type RouteDescription = { name: string; start: string; destination: string };

// Descriptions are private to a space. The illustration is deliberately not a map.
export default function SharedRouteCard({ route, recorded, uid, spaceId, routeId }: { route: RouteDescription; recorded?: boolean; uid?: string; spaceId?: string; routeId?: string }) {
  const [savedRoute, setSavedRoute] = useState<RouteDescription | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function viewSavedRoute() {
    if (!uid || !spaceId || !routeId || loading) return;
    setLoading(true); setStatus(""); setSavedRoute(null);
    try {
      const current = await readSharedRoute(uid, spaceId, routeId);
      if (!active.current) return;
      if (current) setSavedRoute(current as RouteDescription);
      else setStatus("The saved route is no longer available. The recorded description remains above.");
    } catch {
      if (active.current) setStatus("Could not load the saved route. Check your access and try again.");
    } finally { if (active.current) setLoading(false); }
  }
  return <details className="group rounded-xl border border-border bg-background/70">
    <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
      <span className="flex h-20 w-24 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-lg bg-[#E4EFF2] text-[#0C7A8D]" aria-hidden="true"><Map size={25} /><span className="text-[10px] font-medium">No map yet</span></span>
      <span className="sr-only">Map preview unavailable. </span>
      <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{recorded ? "Route at time of logging" : "Saved route"}</span><strong className="mt-1 block break-words text-sm">{route.name}</strong><span className="mt-1 block break-words text-xs text-muted-foreground">{route.start} → {route.destination}</span><span className="mt-2 block text-xs font-medium text-[#0C7A8D]">Route details</span></span>
      <ChevronDown size={17} className="flex-shrink-0 text-[#0C7A8D] transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="space-y-2 border-t border-border p-3 text-sm">
      <p><strong>Start:</strong> {route.start}</p><p><strong>Destination:</strong> {route.destination}</p>
      <p className="text-xs text-muted-foreground">This description has no mapped path or navigation yet.</p>
      {recorded && <p className="text-xs text-muted-foreground">This is the description saved with the drive.</p>}
      {recorded && uid && spaceId && routeId && <button type="button" disabled={loading} className="text-sm text-[#0C7A8D] underline disabled:opacity-50" onClick={() => void viewSavedRoute()}>{loading ? "Loading saved route…" : "View saved route"}</button>}
      {status && <p role="status" className="text-sm">{status}</p>}
      {savedRoute && <div className="rounded-lg border border-border bg-card p-3" aria-label="Current saved route"><p className="font-semibold">{savedRoute.name}</p><p>Start: {savedRoute.start}</p><p>Destination: {savedRoute.destination}</p><p className="mt-1 text-xs text-muted-foreground">Current route description in this learner’s space.</p></div>}
    </div>
  </details>;
}

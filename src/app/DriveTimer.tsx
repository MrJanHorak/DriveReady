import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Square, Timer, Trash2 } from "lucide-react";
import { TIMER_EVENT, elapsedMs, formatElapsed, loadTimer, pauseTimer, resumeTimer, saveTimer, startTimer, stopTimer, timerDraft, timerStatus, timerStorageKey } from "./timerState";
import type { DriveTimer as Timer_ } from "./timerState";
import { Card, ghostButton, heading, mono, primaryButton } from "./design";

type Space = { id: string; learnerName: string; role: string };
export type TimerDraft = { date: string; minutes: number; startedAt: number; endedAt: number; capped: boolean };

function useDriveTimer(uid: string) {
  const [timer, setTimer] = useState<Timer_ | null>(() => loadTimer(uid));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setTimer(loadTimer(uid));
    const reload = () => setTimer(loadTimer(uid));
    const onStorage = (event: StorageEvent) => { if (event.key === timerStorageKey(uid)) reload(); };
    window.addEventListener(TIMER_EVENT, reload);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(TIMER_EVENT, reload); window.removeEventListener("storage", onStorage); };
  }, [uid]);
  const running = timer ? timerStatus(timer) === "running" : false;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  // Keep the phone screen on while a drive is being timed, where the browser allows it.
  useEffect(() => {
    if (!running || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null, cancelled = false;
    const acquire = async () => {
      try { const next = await (navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen"); if (cancelled) void next.release(); else lock = next; } catch { /* not allowed; the timer still works */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); void lock?.release().catch(() => {}); };
  }, [running]);
  const update = useCallback((next: Timer_ | null) => { saveTimer(uid, next); setTimer(next); setNow(Date.now()); }, [uid]);
  return { timer, now, update };
}

/**
 * The drive timer card. `spaceId` is the learner a new timer would be for; a running
 * timer keeps the learner it was started for.
 */
export default function DriveTimer({ uid, spaces, spaceId, blocked, onLog }: { uid: string; spaces: Space[]; spaceId: string; blocked: boolean; onLog: (spaceId: string, draft: TimerDraft) => void }) {
  const { timer, now, update } = useDriveTimer(uid);
  const current = spaces.find((space) => space.id === spaceId);
  const canStart = !!current && ["manager", "supervisor"].includes(current.role);
  if (!timer && !canStart) return null;

  if (!timer) return <Card className="flex flex-wrap items-center justify-between gap-3 p-4" aria-label="Drive timer">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#E4EFF2] text-[#0C7A8D]" aria-hidden="true"><Timer size={18} /></span>
      <div className="min-w-0"><h2 className="text-sm font-bold" style={heading}>Drive timer</h2><p className="text-xs text-muted-foreground">Start it as {current?.learnerName ?? "the learner"} sets off. The passenger should run it, not the driver.</p></div>
    </div>
    <button type="button" className={primaryButton} disabled={blocked} onClick={() => update(startTimer(spaceId, Date.now()))}><Play size={14} aria-hidden="true" /> Start drive timer</button>
  </Card>;

  const status = timerStatus(timer);
  const space = spaces.find((item) => item.id === timer.spaceId);
  const startedLabel = new Date(timer.startedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const discard = () => {
    if (!window.confirm("Discard this timed drive? It won't be logged.")) return;
    update(null);
  };
  const log = () => {
    const stopped = stopTimer(timer, Date.now());
    update(stopped);
    onLog(stopped.spaceId, timerDraft(stopped, Date.now()));
  };
  return <Card className={`p-4 ${status === "running" ? "border-[#0C7A8D]/40 bg-[#F4FAFB]" : ""}`} aria-label="Drive timer">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${status === "running" ? "bg-[#0C7A8D] text-white" : "bg-[#E4EFF2] text-[#0C7A8D]"}`} aria-hidden="true"><Timer size={20} /></span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" style={mono}>{status === "running" ? "Drive in progress" : status === "paused" ? "Paused" : "Drive finished"} · {space?.learnerName ?? "learner no longer available"}</p>
          <p className="text-3xl font-bold tabular-nums text-[#0C7A8D]" style={{ ...heading, lineHeight: 1.15 }} role="timer" aria-label="Driving time">{formatElapsed(elapsedMs(timer, now))}</p>
          <p className="text-xs text-muted-foreground">Started {startedLabel}{timer.pausedMs > 0 || status === "paused" ? " · pauses not counted" : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "running" && <button type="button" className={ghostButton} disabled={blocked} onClick={() => update(pauseTimer(timer, Date.now()))}><Pause size={14} aria-hidden="true" /> Pause</button>}
        {status === "paused" && <button type="button" className={ghostButton} disabled={blocked} onClick={() => update(resumeTimer(timer, Date.now()))}><Play size={14} aria-hidden="true" /> Resume</button>}
        {space && <button type="button" className={primaryButton} disabled={blocked} onClick={log}>{status === "stopped" ? <>Log this drive</> : <><Square size={13} aria-hidden="true" /> Stop &amp; log</>}</button>}
        <button type="button" className={ghostButton} disabled={blocked} onClick={discard} aria-label="Discard timed drive"><Trash2 size={14} aria-hidden="true" /> Discard</button>
      </div>
    </div>
  </Card>;
}

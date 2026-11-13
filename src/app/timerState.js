// Drive timer: kept in this browser per signed-in account, so a reload, a locked
// phone or switching pages does not lose a running drive. One timer per account,
// because a supervisor accompanies one drive at a time.

const VERSION = 1;
const MAX_MINUTES = 1440;
export const TIMER_EVENT = "driveready-drive-timer";

const key = (uid) => `driveready.driveTimer.v${VERSION}.${uid}`;
const isTime = (value) => Number.isSafeInteger(value) && value > 0;

/** @typedef {{ version: 1, spaceId: string, startedAt: number, pausedAt: number | null, pausedMs: number, endedAt: number | null }} DriveTimer */

/** @returns {DriveTimer | null} */
export function parseTimer(value) {
  if (!value || typeof value !== "object") return null;
  const { version, spaceId, startedAt, pausedAt, pausedMs, endedAt } = value;
  if (version !== VERSION || typeof spaceId !== "string" || !spaceId || !isTime(startedAt)) return null;
  if (!(pausedAt === null || (isTime(pausedAt) && pausedAt >= startedAt))) return null;
  if (!(Number.isSafeInteger(pausedMs) && pausedMs >= 0)) return null;
  if (!(endedAt === null || (isTime(endedAt) && endedAt >= startedAt))) return null;
  return { version, spaceId, startedAt, pausedAt, pausedMs, endedAt };
}

/** @returns {DriveTimer} */
export function startTimer(spaceId, now) {
  return { version: VERSION, spaceId, startedAt: now, pausedAt: null, pausedMs: 0, endedAt: null };
}
/** @param {DriveTimer} timer */
export function pauseTimer(timer, now) {
  return timer.pausedAt !== null || timer.endedAt !== null ? timer : { ...timer, pausedAt: Math.max(now, timer.startedAt) };
}
/** @param {DriveTimer} timer */
export function resumeTimer(timer, now) {
  if (timer.pausedAt === null || timer.endedAt !== null) return timer;
  return { ...timer, pausedAt: null, pausedMs: timer.pausedMs + Math.max(0, now - timer.pausedAt) };
}
/** @param {DriveTimer} timer */
export function stopTimer(timer, now) {
  if (timer.endedAt !== null) return timer;
  const resumed = resumeTimer(timer, timer.pausedAt ?? now);
  return { ...resumed, endedAt: timer.pausedAt ?? Math.max(now, timer.startedAt) };
}

/** Driving time in milliseconds, excluding pauses. @param {DriveTimer} timer */
export function elapsedMs(timer, now) {
  const end = timer.endedAt ?? timer.pausedAt ?? now;
  return Math.max(0, end - timer.startedAt - timer.pausedMs);
}

/** @param {DriveTimer} timer */
export function timerStatus(timer) {
  return timer.endedAt !== null ? "stopped" : timer.pausedAt !== null ? "paused" : "running";
}

export function localDate(ms) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Values for the drive form: the local start date and whole minutes (1 to 1,440). @param {DriveTimer} timer */
export function timerDraft(timer, now) {
  const minutes = Math.min(MAX_MINUTES, Math.max(1, Math.round(elapsedMs(timer, now) / 60000)));
  return { date: localDate(timer.startedAt), minutes, startedAt: timer.startedAt, endedAt: timer.endedAt ?? now, capped: elapsedMs(timer, now) > MAX_MINUTES * 60000 };
}

export function formatElapsed(ms) {
  const total = Math.floor(ms / 1000), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Browser storage can be unavailable (private windows, blocked storage); the timer
// then lives in memory for the open page.
const memory = new Map();
export function loadTimer(uid, storage = globalThis.localStorage) {
  let raw;
  try {
    if (!storage) throw new Error("no storage");
    raw = storage.getItem(key(uid));
  } catch { return memory.get(uid) ?? null; }
  try { return parseTimer(JSON.parse(raw ?? "null")); } catch { return null; }
}
export function saveTimer(uid, timer, storage = globalThis.localStorage) {
  if (timer) memory.set(uid, timer); else memory.delete(uid);
  try { if (!storage) throw new Error("no storage"); if (timer) storage.setItem(key(uid), JSON.stringify(timer)); else storage.removeItem(key(uid)); } catch { /* memory copy above */ }
  try { globalThis.dispatchEvent?.(new CustomEvent(TIMER_EVENT, { detail: { uid } })); } catch { /* no window */ }
}
export const timerStorageKey = key;

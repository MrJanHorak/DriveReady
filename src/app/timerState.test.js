import test from "node:test";
import assert from "node:assert/strict";
import { elapsedMs, formatElapsed, loadTimer, localDate, parseTimer, pauseTimer, resumeTimer, saveTimer, startTimer, stopTimer, timerDraft, timerStatus, timerStorageKey } from "./timerState.js";

const MIN = 60000;
const t0 = new Date(2026, 10, 12, 18, 30, 0).getTime(); // local time, Nov 12 2026 6:30 pm

test("elapsed time excludes pauses and stops at the end", () => {
  let timer = startTimer("space-1", t0);
  assert.equal(timerStatus(timer), "running");
  assert.equal(elapsedMs(timer, t0 + 10 * MIN), 10 * MIN);
  timer = pauseTimer(timer, t0 + 10 * MIN);
  assert.equal(timerStatus(timer), "paused");
  assert.equal(elapsedMs(timer, t0 + 25 * MIN), 10 * MIN);
  assert.equal(pauseTimer(timer, t0 + 30 * MIN), timer, "pausing twice changes nothing");
  timer = resumeTimer(timer, t0 + 25 * MIN);
  assert.equal(elapsedMs(timer, t0 + 40 * MIN), 25 * MIN);
  timer = stopTimer(timer, t0 + 52 * MIN);
  assert.equal(timerStatus(timer), "stopped");
  assert.equal(elapsedMs(timer, t0 + 99 * MIN), 37 * MIN);
  assert.equal(stopTimer(timer, t0 + 99 * MIN), timer);
});

test("stopping while paused ends at the pause", () => {
  const timer = stopTimer(pauseTimer(startTimer("s", t0), t0 + 20 * MIN), t0 + 45 * MIN);
  assert.equal(elapsedMs(timer, t0 + 60 * MIN), 20 * MIN);
  assert.equal(timer.endedAt, t0 + 20 * MIN);
});

test("draft uses the local start date and whole minutes between 1 and 1,440", () => {
  const timer = startTimer("s", t0);
  assert.deepEqual(timerDraft(timer, t0 + 47 * MIN + 29000), { date: "2026-11-12", minutes: 47, startedAt: t0, endedAt: t0 + 47 * MIN + 29000, capped: false });
  assert.equal(timerDraft(timer, t0 + 47 * MIN + 31000).minutes, 48);
  assert.equal(timerDraft(timer, t0 + 10000).minutes, 1);
  const late = startTimer("s", new Date(2026, 10, 12, 23, 50).getTime());
  assert.equal(timerDraft(late, late.startedAt + 30 * MIN).date, "2026-11-12", "a drive past midnight keeps its start date");
  const long = timerDraft(timer, t0 + 1500 * MIN);
  assert.equal(long.minutes, 1440);
  assert.equal(long.capped, true);
  assert.equal(localDate(new Date(2026, 0, 5, 1, 0).getTime()), "2026-01-05");
});

test("elapsed time is formatted as mm:ss or h:mm:ss", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(65 * 1000), "01:05");
  assert.equal(formatElapsed(3 * 3600 * 1000 + 4 * MIN + 9000), "3:04:09");
});

test("stored timers are validated and kept per account", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const timer = startTimer("space-1", t0);
  saveTimer("uid-a", timer, storage);
  assert.deepEqual(loadTimer("uid-a", storage), timer);
  assert.equal(loadTimer("uid-b", storage), null);
  store.set(timerStorageKey("uid-a"), "{not json");
  assert.equal(loadTimer("uid-a", storage), null);
  for (const bad of [{ ...timer, version: 2 }, { ...timer, spaceId: "" }, { ...timer, startedAt: -1 }, { ...timer, pausedAt: t0 - 1 }, { ...timer, pausedMs: -5 }, { ...timer, endedAt: "x" }, null, "x"]) {
    assert.equal(parseTimer(bad), null);
  }
  saveTimer("uid-a", null, storage);
  assert.equal(store.size, 0);
});

test("without browser storage the timer is kept in memory", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const timer = startTimer("space-1", t0);
  saveTimer("uid-m", timer, broken);
  assert.deepEqual(loadTimer("uid-m", broken), timer);
  saveTimer("uid-m", null, broken);
  assert.equal(loadTimer("uid-m", broken), null);
});

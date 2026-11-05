// GitHub drops most hourly `schedule` runs (#328: ~4 of 24 a day reached PR steward and Board
// sync), so both workflows fire their cron three times an hour and let this gate keep the extra
// firings free: a scheduled run sweeps only when no sweep of its workflow started recently.
// Pure functions; scripts/debounce.ts reads the runs and calls them.

/** Whether a scheduled run should sweep: no sweep of the workflow started within `minGapMs`. */
export function scheduleDue(nowMs: number, lastSweepStartMs: number | undefined, minGapMs: number): boolean {
  return lastSweepStartMs === undefined || nowMs - lastSweepStartMs >= minGapMs;
}

/** Hours since the last scheduled run when that is over `maxMs` (one decimal), else undefined. */
export function scheduleLateness(
  nowMs: number,
  lastScheduleStartMs: number | undefined,
  maxMs: number,
): number | undefined {
  if (lastScheduleStartMs === undefined) return undefined;
  const late = nowMs - lastScheduleStartMs;
  return late > maxMs ? Math.round(late / 360_000) / 10 : undefined;
}

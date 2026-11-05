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

/** A run of the workflow with whether its sweep job did (or does) run, as opposed to being skipped by a gate. */
export interface SweepCandidate {
  readonly startMs: number;
  readonly swept: boolean;
}

/** Start time of the newest run that actually swept; a run whose gate stopped it doesn't count. */
export function lastSweepStart(runs: readonly SweepCandidate[]): number | undefined {
  const starts = runs.filter((r) => r.swept).map((r) => r.startMs);
  return starts.length ? Math.max(...starts) : undefined;
}

/** Whether a job list shows a sweep: any job besides the gate that wasn't skipped. */
export function didSweep(jobs: readonly { name: string; conclusion: string | null }[]): boolean {
  return jobs.some((j) => j.name !== 'debounce' && j.conclusion !== 'skipped');
}

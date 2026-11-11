// Pure helpers for the browser frame-time report (frameTime.perf.ts, #73). No Node or Playwright imports, so they
// unit-test in `npm test`.

/** The report fails only when the 95th-percentile frame is slower than this: below 30 fps. */
export const FRAME_P95_LIMIT_MS = 33;

export interface FrameStats {
  readonly frames: number;
  readonly meanMs: number;
  /** Nearest-rank 95th percentile. */
  readonly p95Ms: number;
}

/** The mean and nearest-rank p95 of frame times, in ms. Throws RangeError without frames. */
export function frameStats(deltas: readonly number[]): FrameStats {
  if (deltas.length === 0) throw new RangeError('frameStats: no frames recorded');
  const sorted = [...deltas].sort((a, b) => a - b);
  const meanMs = sorted.reduce((sum, ms) => sum + ms, 0) / sorted.length;
  const p95Ms = sorted[Math.ceil(0.95 * sorted.length) - 1]!;
  return { frames: sorted.length, meanMs, p95Ms };
}

/** The job summary section (`GITHUB_STEP_SUMMARY`): frames, mean, p95 against the limit. */
export function frameSummary({ frames, meanMs, p95Ms }: FrameStats): string {
  const verdict = p95Ms > FRAME_P95_LIMIT_MS ? '❌ over the limit' : '✅ within the limit';
  return [
    '### Frame times: Heavy load in the browser',
    '',
    '| Frames | Mean | p95 | p95 limit |',
    '| --- | --- | --- | --- |',
    `| ${frames} | ${meanMs.toFixed(1)} ms | ${p95Ms.toFixed(1)} ms | ${FRAME_P95_LIMIT_MS} ms |`,
    '',
    `${verdict}. Headless Chromium on a CI runner has no GPU, so these numbers are a trend, not a target (docs/performance.md).`,
    '',
  ].join('\n');
}

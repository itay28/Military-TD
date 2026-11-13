import { appendFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { HEAVY_LOAD_WARMUP_TICKS } from '../../src/sim/heavyLoadTicks';
import { openGame } from '../e2e/helpers';
import { FRAME_P95_LIMIT_MS, frameStats, frameSummary } from './frameStats';

// The browser frame-time report (#73, docs/performance.md): `npm run test:perf:browser`. It writes mean and p95 to
// the job summary. The CI step is continue-on-error (report only) until rendering is faster; the test still fails over 33 ms p95.

/** How long frames are recorded for, in ms. */
const RECORD_MS = 4000;

test('the Heavy load plays in real time above 30 fps (p95)', async ({ page }) => {
  // Player mode: the real-time loop and animations run, as for a player.
  await openGame(page, { manualStep: false, anim: true });
  await page.evaluate(() => window.__TD__!.loadScenario('heavy-load'));
  await page.evaluate((warmupTicks) => {
    window.__TD__!.command({ type: 'callNextWave' });
    window.__TD__!.step(warmupTicks);
  }, HEAVY_LOAD_WARMUP_TICKS);

  const deltas = await page.evaluate(
    (recordMs) =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const frame = (now: number) => {
          times.push(now);
          if (now - times[0]! < recordMs) requestAnimationFrame(frame);
          else resolve(times.slice(1).map((t, i) => t - times[i]!));
        };
        requestAnimationFrame(frame);
      }),
    RECORD_MS,
  );
  const state = await page.evaluate(() => window.__TD__!.state());
  expect(state.phase, 'the Heavy load is still mid-wave').toBe('wave');

  const stats = frameStats(deltas);
  const summary = frameSummary(stats);
  console.log(summary);
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryFile) appendFileSync(summaryFile, `${summary}\n`);
  expect(stats.p95Ms, `p95 frame time (mean ${stats.meanMs.toFixed(1)} ms)`).toBeLessThanOrEqual(FRAME_P95_LIMIT_MS);
});

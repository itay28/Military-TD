import { expect, it } from 'vitest';
import { TICK_MS } from '../../src/sim/game';
import { createHeavyLoadGame, HEAVY_LOAD_MEASURE_TICKS } from '../../src/sim/heavyLoad';

// The sim's hard performance gate (#73, docs/performance.md): `npm run test:perf`, on its own, one file at a time,
// so other suites don't skew the clock.
//
// Measured mean tick time for the Heavy load (median of RUNS):
//   - Claude Code cloud container (4 vCPU), Node 22: 0.17–0.18 ms
//   - GitHub ubuntu-latest runner, Node 24: 0.088 ms (runs 0.086–0.101), PR #384
// The budget is about 3× the CI mean. To update it, see docs/performance.md → Updating the budget.
const SIM_TICK_BUDGET_MS = 0.27;

/** Timed runs; the median of their means is checked, so one hiccup doesn't fail the gate. */
const RUNS = 5;

/** The mean wall-clock time of one tick, in ms, over the Heavy load's measured ticks. */
function meanTickMs(): number {
  const game = createHeavyLoadGame();
  const start = performance.now();
  for (let i = 0; i < HEAVY_LOAD_MEASURE_TICKS; i++) game.tick(TICK_MS);
  return (performance.now() - start) / HEAVY_LOAD_MEASURE_TICKS;
}

it(`a Heavy load tick takes under ${SIM_TICK_BUDGET_MS} ms on average`, () => {
  meanTickMs(); // warm up the JIT
  const means = Array.from({ length: RUNS }, meanTickMs).sort((a, b) => a - b);
  const median = means[Math.floor(RUNS / 2)]!;
  console.log(`Heavy load mean tick: ${median.toFixed(3)} ms (runs: ${means.map((ms) => ms.toFixed(3)).join(', ')})`);
  expect(median).toBeLessThan(SIM_TICK_BUDGET_MS);
});

# Performance checks

Two checks catch performance regressions (#73). Both time the same **Heavy load**: a seeded game on Serpentine (the
longest Path; every map is 16 × 10) with 40 towers of every kind and one wave of 200 enemies of every kind, mid-wave
once they've all spawned. `src/sim/heavyLoad.ts` builds it (numbers in `src/data/heavyLoad.ts`), and the `heavy-load`
scenario gives the browser the same setup.

| Check | Command | Where it runs in CI | Fails when |
| --- | --- | --- | --- |
| Sim budget (hard gate) | `npm run test:perf` | `ci` job, after the tests | the mean sim tick time is over `SIM_TICK_BUDGET_MS` |
| Frame-time report | `npm run test:perf:browser` | `e2e` job, after the e2e tests | the p95 frame time is over 33 ms (below 30 fps) |

## Sim budget

`tests/perf/simBudget.perf.test.ts` builds the Heavy load, warms up the JIT with one untimed run, then times five runs
of `HEAVY_LOAD.measureTicks` ticks (5 s of game time) and checks the median of their mean tick times against
`SIM_TICK_BUDGET_MS`. It has its own Vitest config (`vitest.perf.config.ts`), one file at a time, and `npm test`
leaves `*.perf.test.ts` out, so other suites don't share the CPU while it's timed. It prints the measured mean.

Node only, no browser: the sim is the same everywhere (ADR-0002), so its timing is stable from run to run.

## Frame-time report

`tests/perf/frameTime.perf.ts` (Playwright, `playwright.perf.config.ts`: one worker, no retries) opens the game in
player mode (real-time loop, animations on), loads `heavy-load` through `__TD__`, starts the wave and steps past the
spawns, then records `requestAnimationFrame` frame times for 4 s. It writes frames, mean and p95 to the job summary
(`GITHUB_STEP_SUMMARY`) and prints them locally.

Headless Chromium on a CI runner has no GPU and draws in software, and its frame rate varies from run to run, so this
is a trend to watch, not a strict target: it fails only below 30 fps at p95. It runs even when an e2e test failed, so
the summary always has the numbers.

## Running them locally

```sh
npm run test:perf           # the sim budget
npm run test:perf:browser   # the frame-time report: builds the game and serves it, like npm run test:e2e
```

Your machine's numbers are only comparable with themselves: CI's are the ones the budget is set from.

## Updating the budget

Change the budget only when a change makes the sim slower on purpose (more enemies, a costlier rule), or when CI's
runners change.

1. Read the measured mean from the *Sim performance budget* step of a recent `ci` run on `main` (`Heavy load mean
   tick: … ms`). Look at a few runs, not one.
2. Set `SIM_TICK_BUDGET_MS` in `tests/perf/simBudget.perf.test.ts` to about 3× that mean, and update the measured
   numbers in the comment above it.
3. Say why in the PR.

Changing the Heavy load itself (`src/data/heavyLoad.ts`) changes what's measured, so re-measure and update the budget
in the same PR.

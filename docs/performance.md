# Performance checks

Two checks catch performance regressions (#73). Both time the same **Heavy load**: a seeded game on Serpentine (the
longest Path after Gauntlet's; Gauntlet's lets the towers kill too many of the 200 during the warmup) with 40 towers of
every kind and one wave of 200 enemies of every kind, mid-wave once they've all spawned. `src/sim/heavyLoad.ts` builds it (numbers in `src/data/heavyLoad.ts`), and the `heavy-load`
scenario gives the browser the same setup.

| Check | Command | Where it runs in CI | Fails when |
| --- | --- | --- | --- |
| Sim budget (hard gate) | `npm run test:perf` | `ci` job, after the tests | the mean sim tick time is over `SIM_TICK_BUDGET_MS` |
| Frame-time check | `npm run test:perf:browser` | `e2e` job, after the e2e tests | the p95 frame time is over `FRAME_P95_LIMIT_MS` (65 ms) |

## Sim budget

`tests/perf/simBudget.perf.test.ts` builds the Heavy load, warms up the JIT with one untimed run, then times five runs
of `HEAVY_LOAD_MEASURE_TICKS` ticks (5 s of game time) and checks the median of their mean tick times against
`SIM_TICK_BUDGET_MS`. It has its own Vitest config (`vitest.perf.config.ts`), one file at a time, and `npm test`
leaves `*.perf.test.ts` out, so other suites don't share the CPU while it's timed. It prints the measured mean.

Node only, no browser: the sim is the same everywhere (ADR-0002), so its timing is stable from run to run.

## Frame-time check

`tests/perf/frameTime.perf.ts` (Playwright, `playwright.perf.config.ts`: one worker, no retries) opens the game in
player mode (real-time loop, animations on), loads `heavy-load` through `__TD__`, starts the wave and steps past the
spawns, then records `requestAnimationFrame` frame times for 4 s. It writes frames, mean and p95 to the job summary
(`GITHUB_STEP_SUMMARY`), prints them locally, and fails when the p95 is over `FRAME_P95_LIMIT_MS`
(`tests/perf/frameStats.ts`). The CI step runs even when an e2e test failed, so the summary always has the numbers.

**The reference machine is the CI runner**: headless Chromium with no GPU, drawing in software (SwiftShader). It is
the slowest and most repeatable setup we have, so the limit is set from its numbers. Frames there land on 60 Hz steps
(16.7, 33.4, 50 ms…), so a p95 of 33.4 ms means "at most two frames' time".

### The limit

The target was 33 ms p95 (30 fps). After the rendering work in #420, five CI runs of the Heavy load measured
**30.1–40.9 ms mean and 33.4–50.1 ms p95**: one run's p95 frame took two 60 Hz steps, the other four took three. So the
limit is set the way the sim budget was: the worst p95 × 1.25, rounded up to the next 5 ms = **65 ms**. A run whose p95
frame takes four steps (66.7 ms) fails; before #420 it took six (100 ms).

To change it, read the *Frame-time check* summary of a few recent `e2e` runs on `main`, and say why in the PR.

### Where the frame time goes (#420)

Measured in a cloud container with the same software renderer (A/B on fresh pages; a second measurement on the same
page always reads faster, as enemies die and the JIT warms up). JavaScript was about 4.5 ms of each frame; the rest
was the software renderer drawing.

| Cost | Before | Fix |
| --- | --- | --- |
| Draw calls | 254 per frame, each switching shader: every enemy drew its sprite, then its own HP-bar Graphics | Every sprite's HP bar on one Graphics per layer (`hpBars` over ground enemies, `airHpBars` over air ones): 6 draw calls |
| WebGL multisampling (Phaser's `antialiasGL`, on by default) | about a third of the frame | Off. Sprites keep their smooth edges from their own transparency; drawn shapes (range rings, grid, tracers) get harder edges |
| Transparent pixels of renders | a render is a square canvas, often mostly empty around the unit (a turret fills 7–25% of it), and every pixel of a quad costs | Each render is drawn from a copy cut to its visible part (`opaqueBounds`, `trimmedOrigin` in `src/scenes/trim.ts`), with its pivot kept. Pixels at alpha ≤ 4 of 255 at the edge are left out (`RENDER_TRIM_FAINT_ALPHA`) |

`maxTextures: 1` (one texture per batch) fixes a rendering bug, not a cost: with several textures in one batch, the
software renderer sampled the wrong texture over parts of some sprites (the cannon turret lost its back half). It
costs about 2.5 ms a frame there.

Not worth it: downscaling the 2× painted ground to the zoom (no change), and the DOM HUD (no change when hidden).

| Heavy load | Mean | p95 |
| --- | --- | --- |
| CI, before (#73) | 95 ms | 100 ms |
| CI, after (5 runs) | 30.1–40.9 ms | 33.4–50.1 ms |
| Cloud container, before | 69–73 ms | 83–100 ms |
| Cloud container, after | 28 ms | 33.4 ms |

What is left is spread out: the full-screen ground image, tower hulls and turrets, enemy sprites, each a few ms.

## Running them locally

```sh
npm run test:perf           # the sim budget
npm run test:perf:browser   # the frame-time check: builds the game and serves it, like npm run test:e2e
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

# 3. The whole game is testable by agents, with or without a browser

Date: 2026-10-24 · Status: Accepted

## Context

The project aims to be developed, tested and integrated by AI agents with as little human involvement as possible. That means no behaviour should need a human to open the game and play it to confirm it works, and CI must run the checks quickly.

## Decision

Three test layers, all automated and all run in CI:

1. **Unit tests (Vitest)** for sim modules, through their public interfaces.
2. **Scenario tests (Vitest, headless).** `runScenario()` in `src/sim/scenario.ts` builds any game situation from a declarative description (map, money, lives, pre-placed towers, waves, a script of timed commands, a stop condition). It runs the sim with no rendering, as fast as the CPU allows, and returns the outcome, final state and event log. Named scenarios live in `tests/scenarios/`, and `npm run scenario -- <name> [--json]` runs one from the command line so agents can inspect a game without a browser. Scripted "bot" strategies in scenarios can play whole games, which also supports automated balance checks.
3. **UI tests (Playwright, headless Chromium)** against the built game. A test mode, turned on with URL flags, makes the browser game deterministic and inspectable:
   - `?test=1` exposes `window.__TD__` (`state()`, `command()`, `step(ticks)`, `loadScenario(name)`)
   - `?step=manual` stops the real-time loop; tests advance ticks explicitly
   - `?anim=0` disables cosmetic animation (tweens, fades, effects)
   - `?speed=N` runs the loop N× faster

   Tests click the canvas at tile coordinates like a player would, and assert on sim state and on the DOM.

Supporting rules:
- **HUD and menus are a DOM overlay** on top of the canvas, not Phaser text. Playwright can find them by role and text, and they're accessible.
- **Determinism:** the sim never reads the clock or `Math.random` (enforced by ESLint). Randomness comes from a seeded RNG in `src/sim/rng.ts`.
- **Screenshot tests** (`toHaveScreenshot`) cover key screens with `anim=0`. Baselines are generated and compared only in the CI Linux container, to avoid font and GPU differences between machines.

## Consequences

- Agents can verify almost every change on their own. Only "does it feel fun" needs a human.
- Some extra code (test hooks, scenario runner) has to be maintained. It ships in the build but is inert unless `?test=1` is set.
- Choosing DOM for the UI means mixing Phaser and HTML layout. It's a small cost compared to testing UI drawn on the canvas.

# Military-TD — Plan

A basic military-themed tower defense game that runs in the browser.

- **Stack**: TypeScript (strict) + Phaser 4 + Vite, tests with Vitest and Playwright. See [ADR-0001](adr/0001-typescript-phaser-vite.md).
- **Architecture**: a pure-TypeScript **Simulation** that has no Phaser in it, drawn by thin Phaser **Scenes**. HUD and menus are a DOM overlay. See [ADR-0002](adr/0002-simulation-separate-from-rendering.md).
- **Testing**: everything can be tested by agents with no human: headless scenario runs plus browser UI tests. See [ADR-0003](adr/0003-agent-testable-game.md).
- **Versioning**: SemVer. 0.x until the first public release; each roadmap milestone is a minor version. See [ADR-0004](adr/0004-versioning-and-releases.md).
- **How work gets done**: plan → tests first → implement → verify → PR. See [docs/agents/workflow.md](agents/workflow.md).
- Vocabulary is in [GLOSSARY.md](../GLOSSARY.md).

## Roadmap (milestones)

| Version | Theme | Scope |
| --- | --- | --- |
| **v0.1.0** | MVP | 1 map, 1 tower (Rifle Nest), 1 enemy (Infantry), 1 wave, Money, Lives, victory/defeat, shapes for graphics. Plus the foundations: CI, headless scenario runner, UI test harness, release automation, Pages deploy. |
| **v0.2.0** | Expand | ~4 towers (Rifle Nest, Cannon, AA Gun, Mortar), ~4 enemies (Infantry, Jeep, Tank, Helicopter), armor and air/ground, 10 waves, 2 maps, tower build bar, balance. |
| **v0.3.0** | Art | Free asset packs (CC0) replace shapes: sprites, tileset, combat effects, sound. Licenses tracked in `CREDITS.md`. |
| **v0.4.0** | Menus & settings | Main menu, pause menu, settings (persisted), game speed toggle, level select. |
| **v1.0.0** | Release | First public release. Scope decided after v0.4.0: polish, bug fixes, playtest feedback. |

## How issues are organized

| GitHub feature | We use it for | Example |
| --- | --- | --- |
| **Milestone** | *When* it ships: one per version | `v0.2.0 — Expand` |
| **Epic** (a parent issue labelled `epic`) | *What area* it belongs to. Every task is a sub-issue of exactly one epic, so each epic shows a progress bar. | #19 Core mechanics |
| **`area:*` label** | The same area as the epic, as a label for filtering and colors | `area:towers` |
| **Triage label** | Whether it's ready to work on | `needs-triage` → `ready-for-agent` / `ready-for-human` |
| **Blocked by** | Native issue dependencies. Don't start an issue while it has an open blocker. | #9 blocked by #6, #8 |
| **Project board** | The views: board by status, table by milestone, current work | *Military-TD Roadmap* (not created yet: the agent token needs Projects access) |

Epics: #19 Core mechanics · #20 Towers · #21 Units · #22 UI · #23 Art & audio · #24 Infra & testing.

Issues in v0.1.0 are fully specified (`ready-for-agent`). Issues in later milestones are labelled `needs-triage`: they hold the goal only, and get planned (per the workflow) when their milestone comes up.

## Game flow

MVP (v0.1.0):

```
 Boot ──▶ Game ──────────────────────────────────────┐
          │  Build phase ──Start Wave──▶ Wave phase  │
          │      ▲                          │        │
          │      └──── wave cleared ────────┘        │
          │  lives = 0 ─────────▶ Defeat             │
          │  last wave cleared ─▶ Victory            │
          └───────────────────┬──────────────────────┘
               Restart        ▼
          ◀──────────── End overlay (Victory | Defeat)
```

From v0.4.0, a Main menu sits between Boot and Game (Play, Settings, Credits), and a Pause menu sits over Game.

**Core loop (one wave):**

1. **Build phase.** The player places towers on buildable tiles (not on the Path) if they have enough Money.
2. The player presses **Start Wave**.
3. **Wave phase.** Enemies spawn at the Path start, one every `spacing` ms, and walk along the Path's waypoints.
4. Each tower targets the in-range enemy furthest along the Path ("first") and fires on a cooldown. Each hit deals damage instantly (hitscan) and is drawn as a short tracer line.
5. When an enemy's HP reaches 0 it dies and the player gets its **Reward**. An enemy that reaches the Path end **leaks** and costs Lives.
6. When every enemy in the wave has died or leaked, the wave is cleared and play returns to the Build phase. Placing towers is also allowed during a wave.

## Architecture

```
src/
  sim/        Pure TS, deterministic, no Phaser, no Math.random/Date.now. Unit + scenario tested.
    game.ts     createGame(config) → { tick(dtMs), placeTower(kind, tile), startWave(), state, events }
    map.ts      grid, path waypoints, buildable tiles
    enemies.ts  movement along the path, leaking
    towers.ts   targeting, cooldowns, damage
    waves.ts    spawn schedule, wave/phase transitions
    economy.ts  money, costs, rewards
    scenario.ts runScenario(): headless, as fast as the CPU allows
    rng.ts      seeded RNG (the only source of randomness)
  data/       Plain objects: maps, tower/enemy stats, waves. Tuning happens here.
  scenes/     Phaser scenes: Boot, Game (+ Menu etc. later). Read sim.state, call sim commands.
  ui/         DOM overlay: HUD, end screen, menus. Queryable by Playwright.
  testing/    Test-mode hooks (window.__TD__), enabled with ?test=1
  main.ts     Phaser.Game config
tests/
  scenarios/  Named scenarios (*.scenario.ts) run by Vitest and `npm run scenario`
  e2e/        Playwright UI tests
```

- **The Simulation decides everything.** Scenes and the UI never change game state directly. They call commands (`placeTower`, `startWave`), and each command returns success or a reason for failure.
- **Fixed timestep.** The Game scene calls `sim.tick(1000/60)` a whole number of times per frame. Tests step ticks directly. The same inputs always produce the same result.
- **Units.** Positions are in tiles (floats), speeds in tiles/second, times in ms. Only Scenes convert tiles to pixels (`TILE_PX = 48`).
- **Events.** The sim emits `enemyKilled`, `enemyLeaked`, `towerFired`, `waveStarted`, `waveCleared`, `victory`, `defeat` for the scenes and UI to use in visuals and HUD updates.

## Starting numbers (tune in `src/data`)

| Thing | Value |
| --- | --- |
| Grid | 16 × 10 tiles, 48 px each → 768 × 480 canvas |
| Start money / lives | 100 / 20 |
| Rifle Nest | cost 50, range 2.5 tiles, 2 shots/s, 10 damage |
| Infantry | 30 HP, 1.5 tiles/s, reward 5, leak cost 1 life |
| MVP wave | 8 Infantry, 800 ms spacing |

## v0.1.0 — MVP tasks

| Issue | Epic | Blocked by |
| --- | --- | --- |
| #4 Scaffold Vite + TS + Phaser 4 | Infra | |
| #5 CI: typecheck, lint, test, build | Infra | #4 |
| #6 Sim: map and Path model | Core | #4 |
| #7 Sim: enemy movement and leaking | Units | #6 |
| #25 Headless scenario runner | Infra | #7 |
| #8 Sim: tower targeting and firing | Towers | #7 |
| #9 Sim: economy and tower placement | Core | #6, #8 |
| #10 Sim: waves, phases, victory/defeat | Core | #7 |
| #11 Game scene with fixed-timestep loop | UI | #6 |
| #26 UI test harness (Playwright, test mode) | Infra | #11 |
| #12 Render enemies, towers, tracers | UI | #8, #11 |
| #13 Tower placement input | UI | #9, #11 |
| #14 HUD (DOM overlay) | UI | #10, #11 |
| #15 End screen and restart | UI | #14 |
| #27 Versioning and release automation | Infra | #5 |
| #17 Deploy to GitHub Pages on release | Infra | #5, #27 |

**Critical path:** #4 → #6 → #7 → #8 → #9 → #13. After #6 is done, the sim chain (#7 onward) and the scene work (#11 onward) can run in parallel. Do #25 and #26 early: later tasks write their tests on top of them.

## Later milestones

- **v0.2.0 Expand:** #28 damage model · #29 Cannon · #30 AA Gun · #31 Mortar · #32 Jeep · #33 Tank · #34 Helicopter · #35 build bar · #36 10-wave schedule · #37 second map · #38 map choice · #16 balance (scenario bots + a human playthrough)
- **v0.3.0 Art:** #39 asset packs and licenses · #40 asset pipeline · #41 tower sprites · #42 enemy sprites · #43 tileset · #44 effects · #45 sound
- **v0.4.0 Menus & settings:** #46 main menu · #47 pause · #48 settings · #49 persist settings · #50 game speed · #51 level select

## Backlog (not yet issues)

- Tower upgrades and selling; targeting modes (first/last/strongest)
- Score, star ratings, saved progress
- Mobile/touch controls, accessibility pass (colorblind-safe palette, keyboard play)
- PR preview deploys

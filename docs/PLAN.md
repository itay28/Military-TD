# Military-TD — Plan

A military-themed tower defense game that runs in the browser.

- **Stack**: TypeScript (strict) + Phaser 4 + Vite, tests with Vitest and Playwright. See [ADR-0001](adr/0001-typescript-phaser-vite.md).
- **Architecture**: a pure-TypeScript **Simulation** that has no Phaser in it, drawn by thin Phaser **Scenes**. HUD and menus are a DOM overlay. See [ADR-0002](adr/0002-simulation-separate-from-rendering.md).
- **Testing**: everything can be tested by agents with no human: headless scenario runs plus browser UI tests. See [ADR-0003](adr/0003-agent-testable-game.md).
- **Versioning**: SemVer. 0.x until the first public release; each roadmap milestone is a minor version. See [ADR-0004](adr/0004-versioning-and-releases.md).
- **Hosting**: releases deploy to a restricted itch.io page (the repo is private). See [ADR-0005](adr/0005-host-on-itch-io.md).
- **Maps**: authored in Tiled, imported and validated by code. See [ADR-0006](adr/0006-tiled-maps.md).
- **Mechanics**: realistic and readable, with no hard counters: every enemy kind has at least two efficient counters, so no unit is mandatory. See [ADR-0007](adr/0007-realistic-readable-mechanics.md).
- **Assets**: only CC0 / CC-BY / OFL, every file tracked. See [docs/assets.md](assets.md).
- **How work gets done**: plan → tests first → implement → verify → PR, using Matt Pocock's skills. See [docs/agents/workflow.md](agents/workflow.md).
- Vocabulary is in [GLOSSARY.md](../GLOSSARY.md).

## Roadmap (milestones)

The order follows three rules:
1. **Make it fun with shapes first.** Gameplay is proven before any art.
2. **Build the game shell (menus) before the second map**, so the map has a level select to live in.
3. **Do art and the Tiled pipeline before making many maps**, so each map is decorated only once.

| Version | Milestone | Scope |
| --- | --- | --- |
| **v0.1.0** | MVP | 1 map, 1 tower (Rifle Nest), 1 enemy (Infantry), 1 wave, Money, Lives, victory/defeat, shapes. Plus CI, headless scenario runner, UI test harness, release automation, itch.io deploy. |
| **v0.2.0** | Combat depth | Cannon, AA Gun, Mortar; Jeep, Tank, Helicopter; armor and air/ground; upgrades and selling; tower info panel; **live DPS meter for the current wave**; 10 waves; build bar; balance. Still one map. |
| **v0.3.0** | Game shell | Main menu, pause, settings (persisted), game speed, level select (one map for now), **end-screen damage report**. |
| **v0.4.0** | Art & map pipeline | Asset packs with tracked licenses, asset pipeline, sprites, tileset, effects, credits screen. Tiled import and validation; MVP map rebuilt in Tiled. |
| **v0.5.0** | Maps & progression | Maps 2–4, saved progress, unlocks, star ratings, level select with previews. |
| **v0.6.0** | Audio | Sound effects, 2–3 music tracks, audio settings. |
| **v0.7.0** | Polish & accessibility | Onboarding hints, tooltips, next-wave preview, keyboard shortcuts, accessibility pass, touch input, performance budget test. |
| **v0.8.0** | Content & bosses | Sniper, Flamethrower; APC, Fighter jet; Heavy-tank and Gunship bosses; hard difficulty; optional map 5. |
| **v0.9.0** | Beta | Feature freeze, external playtests, bug bash, public itch.io page ready. |
| **v1.0.0** | Release | See the 1.0 target below. |

Milestones have no due dates. On GitHub's Milestones page, sort **Alphabetically** to see them in roadmap order.

## The 1.0 target

A small game that feels finished:

| | 1.0 |
| --- | --- |
| **Towers** | 6: Rifle Nest, Cannon, AA Gun, Mortar, Sniper, Flamethrower. 2 upgrade levels each, selling |
| **Enemies** | 8: Infantry, Jeep, Tank, Helicopter, APC, Fighter jet, plus Heavy-tank and Gunship bosses |
| **Maps** | 4–5 campaign maps, 15–20 waves each, about 10–15 minutes per map |
| **Progression** | Maps unlock in order, 1–3 stars by Lives left, progress saved in the browser, Normal and Hard |
| **Feedback** | Live DPS for the current wave; end-screen damage report per tower and per wave |
| **Look & sound** | One consistent CC0 art style (Kenney), hit effects and explosions, SFX, 2–3 music tracks |
| **Screens** | Main menu, level select, settings, pause, how to play, credits |
| **Platform** | Desktop browser (mouse + keyboard) on itch.io; basic touch support; steady 60 fps |
| **Quality** | Every map beatable by a bot in CI, no known crash bugs, ≥ 3 outside playtesters finished the campaign |

Not in 1.0 (candidates for 1.x): player-made maps / in-game editor, endless mode, full mobile layout, multiplayer, story, achievements.

## How issues are organized

| GitHub feature | We use it for | Example |
| --- | --- | --- |
| **Milestone** | *When* it ships: one per version, no due dates | `v0.2.0 — Combat depth` |
| **Epic** (a parent issue labelled `epic`) | *What area* it belongs to. Every task is a sub-issue of exactly one epic, so each epic shows a progress bar. | #19 Core mechanics |
| **`area:*` label** | The same area as the epic, as a label for filtering and colors | `area:towers` |
| **Triage label** | Whether it's ready to work on | `needs-triage` → `ready-for-agent` / `ready-for-human` |
| **Blocked by** | Native issue dependencies. Don't start an issue while it has an open blocker. | #9 blocked by #6, #8 |
| **Project board** | The views: board by status, table by milestone, current work | [Military-TD Roadmap](https://github.com/users/itay28/projects/4): Board, Current milestone, Roadmap by milestone, Epics, In progress, Releases |

Epics: #19 Core mechanics · #20 Towers · #21 Units · #22 UI · #23 Art & audio · #24 Infra & testing.

v0.1.0 issues are fully specified (`ready-for-agent`). Later issues hold the goal only (`needs-triage`) and get planned when their milestone comes up.

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

From v0.3.0: Boot → Main menu (Play, Settings, Credits) → Level select → Game, with a Pause menu over Game and a damage report on the End screen.

**Core loop (one wave):**

1. **Build phase.** The player places towers on buildable tiles (not on the Path) if they have enough Money.
2. The player presses **Start Wave**.
3. **Wave phase.** Enemies spawn at the Path start, one every `spacing` ms, and walk along the Path's waypoints.
4. Each tower targets the in-range enemy furthest along the Path ("first") and fires on a cooldown. Each hit deals damage instantly (hitscan) and is drawn as a short tracer line.
5. When an enemy's HP reaches 0 it dies and the player gets its **Reward**. An enemy that reaches the Path end **leaks** and costs Lives.
6. When every enemy in the wave has died or leaked, the wave is cleared and play returns to the Build phase. Placing towers is also allowed during a wave.

## Maps

- **v0.1–v0.3:** one map written as data in `src/data/maps.ts`.
- **From v0.4:** maps are drawn in **[Tiled](https://www.mapeditor.org)** (free, open source) and saved as JSON in `maps/*.tmj`. Each map has a ground tile layer, the Path drawn as a polyline object, and buildable tiles marked by a tile property.
- An importer turns the file into sim map data. Tests check every map automatically: the Path is connected and on the edges, there are enough buildable tiles, and a reference bot can win it.
- You edit maps visually in Tiled; agents edit the same JSON as text. Tiled ships no game art; the tileset comes from the CC0 asset packs (e.g. Kenney's Tower Defense (Top-Down), which has ground, road and decoration tiles).
- Asset packs give tiles, not Paths or game rules, so the Path and buildable areas are always authored by us.

## Architecture

```
src/
  sim/        Pure TS, deterministic, no Phaser, no Math.random/Date.now/performance.now. Unit + scenario tested.
    game.ts     createGame(config) → { tick(dtMs), placeTower(kind, tile), startWave(), state, events }
    map.ts      grid, path waypoints, buildable tiles
    enemies.ts  movement along the path, leaking
    events.ts   typed event emitter behind game.events
    towers.ts   targeting, cooldowns, damage
    waves.ts    spawn schedule, wave/phase transitions
    economy.ts  money, costs, rewards (in game.ts until upgrades and selling give it more to do)
    stats.ts    damage/kills/DPS per tower, per wave (v0.2)
    scenario.ts runScenario(): headless, as fast as the CPU allows
    rng.ts      seeded RNG (the only source of randomness)
  data/       Plain objects: tower/enemy stats, waves (and the MVP map). Tuning happens here.
  scenes/     Phaser scenes. Read sim.state, call sim commands.
  ui/         DOM overlay: HUD, panels, end screen, menus. Queryable by Playwright.
  testing/    Test-mode hooks (window.__TD__), enabled with ?test=1
  main.ts     Phaser.Game config
maps/         Tiled maps (*.tmj), from v0.4
assets/       Third-party assets, one folder per pack + manifest.json (see docs/assets.md)
tests/
  scenarios/  Named scenarios (*.scenario.ts) run by Vitest and `npm run scenario`
  e2e/        Playwright UI tests
```

- **The Simulation decides everything.** Scenes and the UI never change game state directly. They call commands (`placeTower`, `startWave`, later `upgradeTower`, `sellTower`), and each command returns success or a reason for failure.
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
| #4 Scaffold Vite + TS + Phaser 4 (+ pre-commit hooks) | Infra | |
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
| #17 Deploy releases to itch.io | Infra | #5, #27 |

**Critical path:** #4 → #6 → #7 → #8 → #9 → #13. After #6 is done, the sim chain (#7 onward) and the scene work (#11 onward) can run in parallel. Do #25 and #26 early: later tasks write their tests on top of them.

## Later milestones

- **v0.2.0 Combat depth:** #28 damage model · #29 Cannon · #30 AA Gun · #31 Mortar · #32 Jeep · #33 Tank · #34 Helicopter · #35 build bar · #36 10-wave schedule · #52 combat stats · #53 live DPS meter · #54 tower info panel · #55 upgrades · #56 selling · #16 balance
- **v0.3.0 Game shell:** #46 main menu · #47 pause · #48 settings · #49 persist settings · #50 game speed · #51 level select · #57 end-screen damage report
- **v0.4.0 Art & map pipeline:** #39 asset packs and licenses · #40 asset pipeline · #41 tower sprites · #42 enemy sprites · #43 tileset · #44 effects · #58 Tiled import · #59 MVP map in Tiled · #60 license check in CI · #61 credits screen
- **v0.5.0 Maps & progression:** #37 second map · #62 maps 3–4 · #63 saved progress · #64 unlocks and stars · #65 level select upgrade
- **v0.6.0 Audio:** #45 SFX · #66 music · #67 audio settings
- **v0.7.0 Polish & accessibility:** #68 onboarding · #69 tooltips and wave preview · #70 keyboard shortcuts · #71 accessibility · #72 touch input · #73 performance budget
- **v0.8.0 Content & bosses:** #74 Sniper · #75 Flamethrower · #76 APC · #77 Fighter jet · #78 Heavy-tank boss · #79 Gunship boss · #80 hard difficulty · #81 map 5
- **v0.9.0 Beta:** #82 public itch.io page · #83 external playtest · #84 feature freeze and bug bash
- **v1.0.0 Release:** #85 release checklist

## Backlog (not yet issues)

- Targeting modes (first / last / strongest)
- Endless mode, in-game map editor, achievements
- PR preview builds

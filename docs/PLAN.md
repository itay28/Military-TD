# Military-TD — Plan

A basic military-themed tower defense game that runs in the browser.

- **Stack**: TypeScript (strict) + Phaser 4 + Vite, tests with Vitest. See [ADR-0001](adr/0001-typescript-phaser-vite.md).
- **Architecture**: a pure-TypeScript **Simulation** that has no Phaser in it, drawn by thin Phaser **Scenes**. See [ADR-0002](adr/0002-simulation-separate-from-rendering.md).
- **Art**: geometric shapes (colored circles and squares with outlines) until the MVP is playable.
- **Tracking**: one GitHub issue per task, all sub-issues of the **MVP roadmap** issue, with native "blocked by" links between them. Vocabulary is in [GLOSSARY.md](../GLOSSARY.md).

## MVP scope ("bare minimum")

The goal is to prove the core loop works. Everything else goes in the backlog.

| In | Out (post-MVP) |
| --- | --- |
| 1 map with a fixed **Path** on a tile grid | Multiple maps, level select |
| 1 tower: **Rifle Nest** | Cannon, anti-air, upgrades, selling |
| 1 enemy: **Infantry** | Jeep, tank, helicopter (air), bosses |
| ~10 **Waves**, started by the player | Auto-waves, speed toggle, pause menu |
| **Money** (start amount + kill rewards) and **Lives** | Score, stars, saved progress |
| Victory and defeat screens, restart | Sound, music, sprites, particles |

## Game flow

```
 ┌────────┐  Play   ┌──────────────────────────────────────────┐
 │  Menu  │───────▶ │                Game                      │
 └────────┘         │                                          │
     ▲              │  Build phase ──Start Wave──▶ Wave phase  │
     │              │      ▲                          │        │
     │              │      └──── wave cleared ────────┘        │
     │              │                                          │
     │              │  lives = 0 ─────────▶ Defeat             │
     │              │  last wave cleared ─▶ Victory            │
     │              └───────────────┬──────────────────────────┘
     │      Restart / Menu          ▼
     └──────────────────────  End screen (Victory | Defeat)
```

**Core loop (one wave):**

1. **Build phase.** The player places Rifle Nests on buildable tiles (not on the Path) if they have enough Money.
2. The player presses **Start Wave**.
3. **Wave phase.** Infantry spawn at the Path start, one every `spacing` ms, and walk along the Path's waypoints.
4. Each Rifle Nest targets the in-range enemy furthest along the Path ("first") and fires on a cooldown. Each hit deals damage instantly (hitscan) and is drawn as a short tracer line.
5. When an enemy's HP reaches 0 it dies and the player gets its **Reward**. An enemy that reaches the Path end **leaks** and costs Lives.
6. When every enemy in the wave has died or leaked, the wave is cleared and play returns to the Build phase. Placing towers is also allowed during a wave.

## Architecture

```
src/
  sim/        Pure TS, deterministic, no Phaser imports. Unit tested.
    game.ts     createGame(config) → { tick(dtMs), placeTower(kind, tile), startWave(), state, events }
    map.ts      grid, path waypoints, buildable tiles
    enemies.ts  movement along the path, leaking
    towers.ts   targeting, cooldowns, damage
    waves.ts    spawn schedule, wave/phase transitions
    economy.ts  money, costs, rewards
  data/       Plain objects: map layout, tower/enemy stats, wave list. Tuning happens here.
  scenes/     Phaser 4 scenes: Boot, Menu, Game, End. Read sim.state, call sim commands.
  main.ts     Phaser.Game config
```

- **The Simulation decides everything.** Scenes never change game state directly. They call commands (`placeTower`, `startWave`), and each command returns success or a reason for failure.
- **Fixed timestep.** The Game scene keeps an accumulator and calls `sim.tick(1000/60)` a whole number of times per frame. The same inputs always produce the same result, so tests can step the sim precisely.
- **Units.** Positions are in tiles (floats), speeds in tiles/second, times in ms. Only the Scenes convert tiles to pixels (`TILE_PX = 48`).
- **Events.** The sim emits `enemyKilled`, `enemyLeaked`, `towerFired`, `waveStarted`, `waveCleared`, `victory`, `defeat` for the scenes to use in visuals and HUD updates.

## Starting numbers (tune in `src/data`)

| Thing | Value |
| --- | --- |
| Grid | 16 × 10 tiles, 48 px each → 768 × 480 canvas |
| Start money / lives | 100 / 20 |
| Rifle Nest | cost 50, range 2.5 tiles, 2 shots/s, 10 damage |
| Infantry | 30 HP, 1.5 tiles/s, reward 5, leak cost 1 life |
| Wave *n* (1-based) | `5 + 2n` infantry, HP × `(1 + 0.15·(n−1))`, spacing 800 ms |
| Wave count | 10 |

## Milestones and tasks

Each item is a sub-issue of [#3 MVP roadmap](https://github.com/itay28/Military-TD/issues/3), with native "blocked by" links.

### M0: Foundations
- **#4 Scaffold the project.** Vite + TS strict + Phaser 4 + Vitest + ESLint/Prettier. `npm run dev | build | test | lint | typecheck`. A blank Phaser scene renders.
- **#5 CI workflow.** GitHub Actions runs typecheck, lint, test, and build on PRs and on pushes to main. *Blocked by #4.*

### M1: Simulation core (pure TS, test-first)
- **#6 Map and Path model.** Grid, waypoint Path, buildable-tile check, MVP map data. *Blocked by #4.*
- **#7 Enemy movement and leaking.** Enemies follow waypoints at their speed. A leak removes the enemy and subtracts Lives. *Blocked by #6.*
- **#8 Tower targeting and firing.** Range check, "first" targeting, cooldown, hitscan damage, death plus Reward event. *Blocked by #7.*
- **#9 Economy and tower placement.** Money state, `placeTower` validation (buildable, unoccupied, affordable), kill rewards. *Blocked by #6, #8.*
- **#10 Waves and game phases.** Wave data, spawn schedule, Build/Wave phases, `startWave`, victory and defeat. *Blocked by #7.*

### M2: Phaser presentation
- **#11 Game scene with fixed-timestep loop.** Draws the grid and Path, drives `sim.tick`. *Blocked by #6.*
- **#12 Draw entities.** Infantry (circles with HP bars), Rifle Nests (squares with a range ring on hover), tracers. *Blocked by #8, #11.*
- **#13 Tower placement input.** Hover highlight (green when valid, red when not), click to place, cost feedback. *Blocked by #9, #11.*
- **#14 HUD.** Money, Lives, Wave x/10, Start Wave button (enabled only in the Build phase). *Blocked by #10, #11.*
- **#15 Scene flow.** Menu → Game → End (Victory/Defeat) → Restart/Menu. *Blocked by #14.*

### M3: Playable MVP
- **#16 Balance pass.** Play through all 10 waves and tune the numbers in `src/data` so the game is winnable but tight. *Blocked by #12, #13, #15.* (human)
- **#17 Deploy to GitHub Pages.** A workflow publishes `dist/` on pushes to main. A maintainer must set Settings → Pages → Source to "GitHub Actions". *Blocked by #5.*

**Critical path:** #4 → #6 → #7 → #8 → #9 → #13 → #16. After #6 is done, the sim chain (#7 onward) and the scene task #11 can run in parallel. After #7 is done, #8 and #10 can run in parallel.

## Post-MVP backlog (not yet issues)

- More towers: Cannon (splash damage), AA Gun (hits air only). Tower upgrades and selling.
- More enemies: Jeep (fast), Tank (armored), Helicopter (air: ignores the Path, only AA can hit it).
- Game speed ×2, pause.
- Sprites (e.g. Kenney CC0 top-down tanks / tower defense packs), sound effects.
- More maps and a level select. Save progress in `localStorage`.

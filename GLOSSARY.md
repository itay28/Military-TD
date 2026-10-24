# Glossary

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Simulation** (sim) | The pure-TS game model in `src/sim`. It owns all game state and rules. | engine, model |
| **Scene** | A Phaser scene in `src/scenes`. It draws the sim and forwards input. It never changes state directly. | screen, view |
| **Tile** | One grid cell. Positions are measured in tiles. | cell, square |
| **Path** | The ordered waypoints enemies walk from spawn to exit. Towers can't be built on Path tiles. | road, lane, track |
| **Waypoint** | A tile where the Path turns, or its first or last tile. Consecutive waypoints share a row or a column; the tiles between them are **Path tiles**. | node, corner |
| **Buildable tile** | A tile where a tower may be placed: not on the Path and not occupied. The map's `isBuildable` checks the first part; placement also checks occupancy. | |
| **Tower** | A placed defensive unit. The MVP has one kind: **Rifle Nest**. | turret |
| **Enemy** | A unit that walks the Path. The MVP has one kind: **Infantry**. | creep, mob |
| **Wave** | A scheduled group of enemies spawned one after another. | round, level |
| **Build phase / Wave phase** | Between waves / while a wave is active. | |
| **Leak** | An enemy reaching the Path end. It costs Lives. | escape |
| **Lives** | How many leaks the player can survive. Defeat at 0. | health, HP (HP is for enemies) |
| **Wave DPS** | Damage per second during the current wave only: damage dealt this wave ÷ time since the wave started. Per tower or in total. Resets when a wave starts. | |
| **Scenario** | A declarative game setup plus a script of timed commands, run headlessly by `runScenario()` to test a situation. | fixture, level (for tests) |
| **Test mode** | The browser game started with `?test=1` (plus `step`, `anim`, `speed` flags), exposing `window.__TD__` for automated UI tests. | debug mode |
| **Money** | Currency for placing towers. Earned as each enemy's **Reward**. | gold, cash |

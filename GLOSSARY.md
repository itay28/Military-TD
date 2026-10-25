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
| **Range** | How far a tower can hit, in tiles from its tile center. The **range ring** shows it while the pointer is over the tower. | reach, radius |
| **Ghost** | The see-through tower and range ring under the pointer, showing where a click would place one: green if `placeTower` would succeed, red if not. None over a standing tower, which shows its own range ring. | preview, hologram |
| **Build bar** | The column of tower buttons right of the map, one per kind, with icon, cost and hotkey (`1`…`n`). The **selected kind** is the one a click on the map places and the Ghost shows. A kind the player can't afford is greyed out. | toolbar, shop |
| **Tracer** | The short line drawn from a tower to the enemy it hit, fading out over about 80 ms. Cosmetic only: hits are instant (hitscan). | bullet, projectile |
| **Enemy** | A unit that walks the Path. The MVP has one kind: **Infantry**. | creep, mob |
| **Wave** | A scheduled set of enemies, made of one or more wave groups that spawn in parallel. Cleared when every group has spawned and no enemy is left. | round, level |
| **Wave group** | Part of a wave: a number of enemies of one kind, the first a delay after the wave starts, then one every spacing. | squad |
| **Build phase / Wave phase** | Between waves / while a wave is active. | |
| **Victory / Defeat** | How a game ends: the last wave cleared with Lives left / Lives reaching 0. Either one stops the Simulation. | win, game over |
| **End screen** | The overlay over the map once the game ends: Victory or Defeat, the waves survived (waves cleared), and **Restart**, which starts a fresh game. | game over screen |
| **Leak** | An enemy reaching the Path end. It costs Lives. | escape |
| **Lives** | How many leaks the player can survive. Defeat at 0. | health, HP (HP is for enemies) |
| **Wave DPS** | Damage per second during the current wave only: damage dealt this wave ÷ time since the wave started. Per tower or in total. Resets when a wave starts. | |
| **Scenario** | A declarative game setup plus a script of timed commands, run headlessly by `runScenario()` to test a situation. | fixture, level (for tests) |
| **Test mode** | The browser game started with `?test=1` (plus `step`, `anim`, `speed` flags), exposing `window.__TD__` for automated UI tests. | debug mode |
| **Release issue** | The issue that stands in for a milestone on the project board: `Release v0.N.0`, labelled `release`. It moves across the board as the milestone is worked, reported and released, and it doesn't count when deciding whether the milestone is done (`docs/agents/releasing.md` → **Milestone release**). | milestone issue |
| **Milestone report** | The PR (`chore: release 0.N.0`) that audits what a milestone planned and delivered (`docs/releases/0.N.0.md`) and triggers its release with a `Release-As: 0.N.0` footer. Not the same as release-please's **release PR**, which it switches to `0.N.0`. | release notes |
| **Money** | Currency for placing towers. Earned as each enemy's **Reward**. | gold, cash |

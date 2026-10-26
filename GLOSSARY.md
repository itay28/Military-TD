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
| **Level** | How far a tower has been upgraded: 1 when placed, up to 3. Each level has its own full stats (`TOWER_LEVELS`), and level pips on the tower show the upgrades. | tier, rank |
| **Sell** | Starting a tower's **Dismantling** (`sellTower`), in the Build or Wave phase. When it ends the tower is gone, the tile is buildable again and the **Refund** is paid; the tower's combat stats stay. | demolish, destroy |
| **Dismantling** | The `DISMANTLE_MS` (2 s) a sold tower takes to come down: it stops firing, can't be upgraded or sold again, and is refunded only when it ends (not if the game ends first). | |
| **Refund** | The Money a sold tower gives back: `floor(SELL_REFUND × spent)`, where `spent` is its placement cost plus every upgrade, and `SELL_REFUND` is 0.7. | |
| **Upgrade** | Raising a tower one level for that level's cost (`upgradeTower`), in the Build or Wave phase. Level 2 adds **optics** (more range), level 3 a **heavier weapon** (more damage and fire rate). The tower keeps its tile and cooldown. | |
| **Range** | How far a tower can hit, in tiles from its tile center. The **range ring** shows it while the pointer is over the tower. | reach, radius |
| **Ghost** | The see-through tower and range ring under the pointer, showing where a click would place one: green if `placeTower` would succeed, red if not. None over a standing tower, which shows its own range ring. | preview, hologram |
| **Tracer** | The short line drawn from a tower to the enemy it hit, fading out over about 80 ms. Cosmetic only: hits are instant (hitscan). | bullet, projectile |
| **Enemy** | A unit that walks the Path. The MVP has one kind: **Infantry**. | creep, mob |
| **Layer** | Where an enemy moves: **Ground** or **Air**. Each tower lists the layers it can hit (`targets`) and ignores enemies on the others. | domain, altitude |
| **Armor** | A flat amount an enemy takes off every hit: a hit removes `damage − armor`, but always at least 1 HP. | defense, resistance |
| **Armor pierce** | How much of the target's Armor a tower's hits ignore (`armorPierce`, 0 by default). It cancels Armor up to its value and never adds damage. | penetration |
| **Hit** | What one shot did to one enemy: the HP it actually removed, after Armor and no more than the enemy had left. A shot lists its hits (one for a direct-fire tower). | |
| **Wave** | A scheduled group of enemies spawned one after another. | round, level |
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

# Glossary

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Simulation** (sim) | The pure-TS game model in `src/sim`. It owns all game state and rules. | engine, model |
| **Scene** | A Phaser scene in `src/scenes`. It draws the sim and forwards input. It never changes state directly. | screen, view |
| **Tile** | One grid cell. Positions are measured in tiles. | cell, square |
| **Path** | The ordered waypoints enemies walk from spawn to exit. Towers can't be built on Path tiles. | road, lane, track |
| **Waypoint** | A tile where the Path turns, or its first or last tile. Consecutive waypoints share a row or a column; the tiles between them are **Path tiles**. | node, corner |
| **Buildable tile** | A tile where a tower may be placed: not on the Path and not occupied. The map's `isBuildable` checks the first part; placement also checks occupancy. | |
| **Tower** | A placed defensive unit. Kinds: **Rifle Nest**, **Cannon**, **Mortar**. | turret |
| **Level** | How far a tower has been upgraded: 1 when placed, up to 3. Each level has its own full stats (`TOWER_LEVELS`), and level pips on the tower show the upgrades. | tier, rank |
| **Upgrade** | Raising a tower one level for that level's cost (`upgradeTower`), in the Build or Wave phase. Level 2 adds **optics** (more range), level 3 a **heavier weapon** (more damage and fire rate). The tower keeps its tile and cooldown. | |
| **Cannon** | An anti-tank gun: slow-firing, ground only, one target, high damage, and Armor pierce enough for a Tank. Wasteful against Infantry: most of each hit is overkill. | artillery, AT gun |
| **Range** | How far a tower can hit, in tiles from its tile center. The **range ring** shows it while the pointer is over the tower. | reach, radius |
| **Minimum range** | The dead zone around a tower's tile center that it can't fire into (`minRange`, exclusive): an enemy at or inside it is never a target, even when it's the only one in Range. The range ring shows it as an inner circle, on the Ghost too. | dead zone, blind spot |
| **Ghost** | The see-through tower and range ring under the pointer, showing where a click would place one: green if `placeTower` would succeed, red if not. None over a standing tower, which shows its own range ring. | preview, hologram |
| **Build bar** | The column of tower buttons right of the map, one per kind, with icon, cost and hotkey (`1`…`n`). The **selected kind** is the one a click on the map places and the Ghost shows. A kind the player can't afford is greyed out. | toolbar, shop |
| **Tracer** | The short line drawn from a tower to the enemy it hit, fading out over about 80 ms. Cosmetic only: hits are instant (hitscan). | bullet, projectile |
| **Enemy** | A unit that walks the Path. Kinds: **Infantry**, **Jeep**, **Tank**, **Helicopter**. | creep, mob |
| **Jeep** | A fast, light ground enemy: 20 HP, 3 tiles/s (twice Infantry), no armor. Tests tower fire rate and coverage, and outruns slow shots. | car, scout |
| **Tank** | A slow, heavy ground Enemy with 200 HP and Armor 5, so a Rifle Nest hit does only 5. Leaking costs 5 Lives; killing it pays 25. | boss, heavy |
| **Helicopter** | An Enemy on the Air layer. It follows the Path like Infantry but only towers that list `air` in `targets` can hit it. Light Armor (2): a Rifle Nest hit does 8. Drawn above ground enemies with a shadow offset below it. Costs 2 Lives if it leaks. | chopper, flyer |
| **Layer** | Where an enemy moves: **Ground** or **Air**. Each tower lists the layers it can hit (`targets`) and ignores enemies on the others. | domain, altitude |
| **Armor** | A flat amount an enemy takes off every hit: a hit removes `damage − armor`, but always at least 1 HP. | defense, resistance |
| **Armor pierce** | How much of the target's Armor a tower's hits ignore (`armorPierce`, 0 by default). It cancels Armor up to its value and never adds damage. | penetration |
| **Hit** | What one shot did to one enemy: the HP it actually removed, after Armor and no more than the enemy had left. A shot lists its hits (one for a direct-fire tower). | |
| **Shell** | What a shell tower (`shell` in its stats, e.g. the Mortar) fires instead of hitting at once. It flies for `flightMs` to the spot where its target stood when fired (no leading), then lands and splashes. It still lands if its tower is gone, and is cleared when the game ends. Not an enemy: it never holds up a wave. | projectile, bullet |
| **Splash** | A landed Shell's damage in two rings around the landing point: enemies within the **inner ring** (`innerRadius`) take the full damage, those within the **outer ring** (`outerRadius`) half, rounded down; each less Armor. Only layers the tower targets are hit. Fast enemies can leave the blast; slow ones and tight groups get hit (ADR-0007). | AoE, blast radius |
| **Mortar** | A slow, long-range, ground-only tower with a Minimum range. It fires Shells, so it punishes slow enemies and tight groups while fast ones can get away, and rewards placement planning. Drawn as a round pit. | artillery |
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
| **Auto-start** | *Board sync* claiming a startable issue (assign + `auto-agent` label) and firing the implement scheduled task for it, when `AUTO_SPAWN` is on (`docs/agents/issue-tracker.md` → **Auto-start**, ADR-0008). | auto-spawn |
| **Stack-next rule** | An issue can start before its blockers merge when every open blocker is closed by an open PR and those PRs sit on one chain of branches; it then branches from, and targets, the chain's tip. | stacking |
| **PR steward** | The Action that gets each open PR to merged: it fires steward rounds, merges the base into PRs that are behind, hands stuck PRs off with `needs-you`, and squash-merges finished ones (`docs/agents/issue-tracker.md` → **PR steward**). | auto-merge bot |
| **Steward round** | One run of the `pr-steward` cloud task on one PR: it fixes conflicts, CI, review findings and maintainer comments, then posts a done marker. A PR gets 3 rounds per maintainer comment. | iteration |
| **Milestone report** | The PR (`chore: release 0.N.0`) that audits what a milestone planned and delivered (`docs/releases/0.N.0.md`) and triggers its release with a `Release-As: 0.N.0` footer. Not the same as release-please's **release PR**, which it switches to `0.N.0`. | release notes |
| **Money** | Currency for placing towers. Earned as each enemy's **Reward**. | gold, cash |

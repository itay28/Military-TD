# Hold the Perimeter

What goes on the itch.io page (#374). Each section below is pasted into the field `README.md` names. The page stays **Restricted** at 1.0 (ADR-0005): only invited testers can play.

## Tagline

Hold the road. A military tower defense on real aerial ground, where every weapon behaves like the real thing.

## Description

**Hold the Perimeter** is a tower defense game in the browser. An enemy column drives down the road toward your HQ, and you dig in along it: rifle positions, anti-aircraft guns, cannons and mortars, placed on satellite photos of real terrain. Hold every wave with HQ intact and the next operation opens.

**Factions.** Russian forces attack, US forces defend. The sides are only how things look: a tower or a vehicle has the same stats on either side.

**Your towers**

- **Rifle Nest**: cheap all-rounder that hits ground and air. Light rounds that armor soaks.
- **AA Gun**: built for aircraft, with fast, light rounds. Hits ground too.
- **Cannon**: slow, heavy shells that punch through armor. Ground only.
- **Mortar**: long-range shells that hit everything in the blast. Ground only, and not up close.

Each tower takes two upgrades (Optics, then a Heavier weapon), and selling one gives back most of what it cost.

**The enemy**

- **Infantry**: no armor. Every tower hurts it, and a mortar blast catches a whole squad.
- **Jeep**: fast but fragile. Quick-firing guns catch it.
- **Tank**: armored, so rifle rounds barely scratch it. Bring a Cannon or a Mortar.
- **Helicopter**: flies over the road, so only Rifle Nests and AA Guns reach it.
- **APC**: armored carrier that rolls up the road and drops a squad of infantry when it is destroyed.
- **Jet**: fast aircraft that streaks over the road. Only Rifle Nests and AA Guns reach it.
- **Heavy tank**: the boss at the end of Hairpin. Thick armor, so it takes Cannon and Mortar shells.

**Realistic, readable mechanics.** Armor takes a set amount off every hit, so a light round does little to a tank and a heavy shell does a lot. Aircraft can only be hit by guns that aim up. Turrets turn before they fire, mortar shells take a second to land, and every weapon has its range drawn on the map. There are no hard counters: a good mix of towers wins, and one kind alone loses.

**Four operations**: Training Ground, Switchback, Serpentine and Hairpin, each on its own stretch of road, each with a Normal and a Hard difficulty. A win earns up to three stars for how much of HQ is left.

Also: three game speeds, a Field manual with every tower and enemy, a live DPS meter, colourblind-safe colours, reduced motion, larger text, and full keyboard play.

## Controls

**Mouse**: click a tower on the build bar, then a free tile to place it. Click a tower to upgrade or sell it, click an enemy to see its card. Drag to pan the map, scroll to zoom.

**Touch**: tap a tower, then a tile. Drag to pan, pinch to zoom. The build bar folds away on a small screen.

**Keyboard**

| Key | Action |
| --- | --- |
| 1–9 | Pick a tower to build |
| U | Upgrade the selected tower |
| S | Sell the selected tower |
| Space | Start the next wave |
| F | Change the game speed |
| P / Esc | Pause (Esc cancels a selection first) |
| ? / H | Show these keys |

The arrow keys move a cursor over the map and Enter builds there, so the whole game plays without a mouse.

## Credits

Every third-party asset (art, sound, music, fonts) is credited with its author and license in the game: **Main menu → Credits**. The aerial ground images are NAIP imagery, courtesy of the USDA Farm Service Agency (public domain). Built with Phaser.

<!-- For the maintainer: the same list is `CREDITS.md` at the repo root (`npm run credits`). The repo is private, so don't link it from the page; paste its sections instead if itch should show every name. -->

## Tags

tower-defense, strategy, military, tactical, 2d, top-down, singleplayer, html5, browser, accessibility

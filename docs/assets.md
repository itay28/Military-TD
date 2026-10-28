# Third-party assets

Every art, audio and font file we didn't make ourselves must be traceable to its source and license. CI enforces this (#60): `npm run check:assets`, part of `npm run check`, fails on a file under `assets/` that no manifest `files` glob covers, a license off the allowlist (CC-BY without attribution, OFL on non-fonts), a pack folder without a license file, or a `CREDITS.md` that differs from `npm run credits`.

**Art direction:** the long-term look is satellite-style milsim art with factions per map ([ADR-0009](adr/0009-satellite-milsim-art-and-factions.md), proposed). The Kenney packs are placeholders until a faction's realistic set is complete.

## Allowed licenses

| License | OK? | Notes |
| --- | --- | --- |
| CC0-1.0 | ✅ | Preferred. Credit anyway (it's polite and costs nothing) |
| CC-BY-3.0 / CC-BY-4.0 | ✅ | Attribution text **must** be recorded and shown on the credits screen |
| OFL-1.1 | ✅ | Fonts only |
| CC-BY-SA, CC-BY-NC, "free for personal use", "royalty free" with no license text, unknown | ❌ | Don't commit |

## Layout

```
assets/
  manifest.json            one entry per pack (below)
  kenney-tower-defense/    files we actually use + the pack's original License.txt
  kenney-ui-pack/
  ...
CREDITS.md                 generated from manifest.json
```

## manifest.json entry

```json
{
  "id": "kenney-tower-defense",
  "name": "Tower Defense (Top-Down)",
  "author": "Kenney",
  "source": "https://kenney.nl/assets/tower-defense-top-down",
  "license": "CC0-1.0",
  "attribution": "Tower Defense (Top-Down) by Kenney (kenney.nl), CC0",
  "downloaded": "2026-10-24",
  "files": ["assets/kenney-tower-defense/**"]
}
```

## Adding an asset

1. Check the license on the **original** source page (not a re-upload).
2. Copy only the files you use into `assets/<pack-id>/`, plus the pack's license file.
3. Add or extend the manifest entry, then regenerate `CREDITS.md` with `npm run credits`.
4. Mention the pack in the PR description.

## Chosen packs (v0.4.0, #39)

Downloaded 2026-10-27. Only the files below are committed (Kenney: Default size PNGs, 64 × 64 tiles), each pack with its `License.txt` unchanged (`.gitattributes` keeps its line endings). The two OpenGameArt items ship no license file, so their `License.txt` copies the license notice from the source page.

| Pack (`assets/<id>/`) | Source | Used for |
| --- | --- | --- |
| Tower Defense (Top-Down) (`kenney-tower-defense`) | kenney.nl/assets/tower-defense-top-down | tower bases and turrets, rocks and bushes, smoke puffs, muzzle flame |
| Top-down Tanks Remastered (`kenney-top-down-tanks`) | kenney.nl/assets/top-down-tanks-remastered | Tank, Rifle Nest sandbags, grass and road tiles, trees, explosions, muzzle flash |
| UI Pack (`kenney-ui-pack`) | kenney.nl/assets/ui-pack | green and grey buttons, play icon (`Green/`, `Grey/`, `Extra/` as in the pack) |
| Topdown Shooter (`kenney-top-down-shooter`), CC0-1.0 | kenney.nl/assets/top-down-shooter | Infantry and the Rifle Nest soldier (`soldier1_gun`, `soldier1_machine`) |
| FreeArt - Topdown extras (`spriteattack-topdown-extras`), CC0-1.0 | opengameart.org/content/freeart-topdown-extras | Jeep (`obj_jeep1`, an olive army jeep) |
| Attack Helicopter (`morgan3d-chopper`), **CC-BY-4.0** | opengameart.org/content/attack-helicopter-0 | Helicopter: the green chopper (column 1, row 2 of the 44 × 99 frames) and the moving rotor (right column, row 2). Attribution is on the credits screen |

The plan named *Top-down Tanks Redux*. Kenney now publishes that set as *Top-down Tanks Remastered* (same sprite names), so that's the one we use.

### Sprite per kind

`tdNNN` is `kenney-tower-defense/towerDefense_tileNNN.png`; plain names are in `kenney-top-down-tanks/`.

| Kind | Base | Turret / body |
| --- | --- | --- |
| Rifle Nest | `sandbagBeige_open` | `soldier1_machine` (soldier with a machine gun, behind the sandbags) |
| AA Gun | `td180` | `td203` (twin barrels) |
| Cannon | `td181` | `td249` (single heavy barrel) |
| Mortar | `td182` | `td226` (short turret) |
| Infantry | | `soldier1_gun` (rifleman) |
| Jeep | | `obj_jeep1` (army jeep) |
| Tank | | `tankBody_sand` + `tankSand_barrel1` |
| Helicopter | | green chopper + moving rotor from `chopper-44x99`, with a ground shadow |

Sizes follow real ones, with 48 px = 1 tile in game: a soldier about 0.4 tile, the Jeep 0.75, the Tank about 1, the Helicopter 1.2. The Kenney tank pack draws small (38 px body), so it's scaled up, and the 52 px soldiers are scaled down.

Map and effects: `tileGrass1`/`tileGrass2` ground, `tileGrass_road{East,North,CornerLL,LR,UL,UR}` for the Path, `td130`/`td131` bushes, `td135`–`td137` rocks, `treeGreen_small`/`treeGreen_large` (#43); `shotOrange` and `td295` muzzle flash, `explosion1`–`3`, `explosionSmoke1`–`3`, `td019`–`td021` smoke (#44).

### Alternatives considered

- **Kenney Top-Down Tanks** (older, CC0): fewer and smaller sprites; Remastered replaces it.
- **Kenney Tanks** (CC0): side view, doesn't fit a top-down map.
- **OpenGameArt.org** helicopters: the CC0 ones are side views; `apache-style-helicopter` is CC-BY-SA (not allowed). `chopper-44x99` is the only top-down one under an allowed license.
- **OpenGameArt.org** jeeps: *Army Jeep* / *German Jeep* (clayster2012) were rejected: one carries a swastika and the license isn't stated clearly.
- **Kenney Tower Defense** `td245`/`td247`/`td269` (first picks): at 48 px they don't read as a soldier or a jeep, so they were replaced.
- **itch.io free packs**: mostly "free for personal use", rejected.

## Candidate sources

- **Kenney** (kenney.nl): CC0. Tower Defense (Top-Down), Top-down Tanks Remastered (formerly Redux), UI Pack, Impact/Interface sounds, Music Jingles.
- **OpenGameArt.org**: mixed licenses. Check each item.
- **itch.io free asset packs**: mixed licenses. Many are "free for personal use" only, which isn't allowed here.

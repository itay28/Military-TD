# Third-party assets

Every art, audio and font file we didn't make ourselves must be traceable to its source and license. CI enforces this from v0.4.0 (#60).

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

All three are Kenney, CC0-1.0, downloaded 2026-10-27. Only the files below are committed (Default size PNGs, 64 × 64 tiles), each pack with its `License.txt` unchanged (`.gitattributes` keeps its line endings).

| Pack (`assets/<id>/`) | Source | Used for |
| --- | --- | --- |
| Tower Defense (Top-Down) (`kenney-tower-defense`) | kenney.nl/assets/tower-defense-top-down | tower bases and turrets, Infantry, Jeep, rocks and bushes, smoke puffs, muzzle flame |
| Top-down Tanks Remastered (`kenney-top-down-tanks`) | kenney.nl/assets/top-down-tanks-remastered | Tank, Rifle Nest sandbags, grass and road tiles, trees, explosions, muzzle flash |
| UI Pack (`kenney-ui-pack`) | kenney.nl/assets/ui-pack | green and grey buttons, play icon (`Green/`, `Grey/`, `Extra/` as in the pack) |

The plan named *Top-down Tanks Redux*. Kenney now publishes that set as *Top-down Tanks Remastered* (same sprite names), so that's the one we use.

### Sprite per kind

`tdNNN` is `kenney-tower-defense/towerDefense_tileNNN.png`; plain names are in `kenney-top-down-tanks/`.

| Kind | Base | Turret / body |
| --- | --- | --- |
| Rifle Nest | `sandbagBeige_open` | `td245` (soldier) |
| AA Gun | `td180` | `td203` (twin barrels) |
| Cannon | `td181` | `td249` (single heavy barrel) |
| Mortar | `td182` | `td226` (short turret) |
| Infantry | | `td247` (soldier) |
| Jeep | | `td269` (light vehicle) |
| Tank | | `tankBody_sand` + `tankSand_barrel1` |
| Helicopter | | **none**: no pack has a rotorcraft (only fixed-wing planes), so it keeps its shape (#40) |

Map and effects: `tileGrass1`/`tileGrass2` ground, `tileGrass_road{East,North,CornerLL,LR,UL,UR}` for the Path, `td130`/`td131` bushes, `td135`–`td137` rocks, `treeGreen_small`/`treeGreen_large` (#43); `shotOrange` and `td295` muzzle flash, `explosion1`–`3`, `explosionSmoke1`–`3`, `td019`–`td021` smoke (#44).

### Alternatives considered

- **Kenney Top-Down Tanks** (older, CC0): fewer and smaller sprites; Remastered replaces it.
- **Kenney Tanks** (CC0): side view, doesn't fit a top-down map.
- **OpenGameArt.org** helicopter sprites: possible later fill for the Helicopter gap; each needs its own license check (many are CC-BY-SA, not allowed).
- **itch.io free packs**: mostly "free for personal use", rejected.

## Candidate sources

- **Kenney** (kenney.nl): CC0. Tower Defense (Top-Down), Top-down Tanks Redux, UI Pack, Impact/Interface sounds, Music Jingles.
- **OpenGameArt.org**: mixed licenses. Check each item.
- **itch.io free asset packs**: mixed licenses. Many are "free for personal use" only, which isn't allowed here.

# Third-party assets

Every art, audio and font file we didn't make ourselves must be traceable to its source and license. CI enforces this (#60): `npm run check:assets`, part of `npm run check`, fails on a file under `assets/` that no manifest `files` glob covers, a license off the allowlist (CC-BY without attribution, OFL on non-fonts), a pack folder without a license file, or a `CREDITS.md` that differs from `npm run credits`.

**Art direction:** the long-term look is satellite-style milsim art with factions per map ([ADR-0009](adr/0009-satellite-milsim-art-and-factions.md), proposed). The Kenney packs are placeholders until a faction's realistic set is complete.

## Allowed licenses

| License | OK? | Notes |
| --- | --- | --- |
| CC0-1.0 | ✅ | Preferred. Credit anyway (it's polite and costs nothing) |
| CC-BY-3.0 / CC-BY-4.0 | ✅ | Attribution text **must** be recorded and shown on the credits screen |
| OFL-1.1 | ✅ | Fonts only |
| PD-USGov (US Government public domain) | ✅ | Works of the US federal government, e.g. USGS / USDA NAIP aerial imagery (ADR-0009). Credit the agency |
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
| Rifle Nest | `sandbagBeige_open` | `td245` (soldier) |
| AA Gun | `td180` | `td203` (twin barrels) |
| Cannon | `td181` | `td249` (single heavy barrel) |
| Mortar | `td182` | `td226` (short turret) |
| Infantry | | `td247` (soldier) |
| Jeep | | `td269` (light vehicle) |
| Tank | | `tankBody_sand` + `tankSand_barrel1` |
| Helicopter | | **none** yet: its sprite (`chopper-44x99`) is a sheet, so it keeps its shape until it joins the atlas |

Map and effects: `tileGrass1`/`tileGrass2` ground, `tileGrass_road{East,North,CornerLL,LR,UL,UR}` for the Path, `td130`/`td131` bushes, `td135`–`td137` rocks, `treeGreen_small`/`treeGreen_large` (#43); `shotOrange` and `td295` muzzle flash, `explosion1`–`3`, `explosionSmoke1`–`3`, `td019`–`td021` smoke (#44).

### Tileset (#43)

The map is drawn from these frames (`src/scenes/tileset.ts`, frame tables in `src/data/sprites.ts`): `tileGrass1` on buildable tiles; on the Path, the road straight or bend that joins the tiles before and after it in walking order (the ends join the grid edge; Kenney names a bend by the corner it wraps around, so `CornerUR` joins north and east); on a non-buildable tile off the Path, `tileGrass2` tinted darker with one tree, bush or rock, picked from a seed made of the map id and the tile. Faint grid lines go over the ground, under the decorations. If the atlas lacks any of these frames, the whole map is drawn as flat colours.

Interim: this table is what `src/data/sprites.ts` draws today, one atlas frame per kind. The Infantry, Rifle Nest soldier, Jeep and Helicopter art from the extra packs above (`soldier1_*`, `obj_jeep1`, `chopper-44x99`) is bigger than an atlas cell or is a sheet, so it joins the atlas with the later sprite issues (#41, #42).

### Atlas (#40)

The game loads one texture atlas, `assets/atlas/sprites.{png,json}` (Phaser JSON hash), not the PNGs above. `npm run atlas` (`scripts/atlas.ts`) packs every PNG of the Tower Defense and Tanks packs into it, one 64 px cell each, frame name = file name without `.png`; rerun it and commit the output after adding or changing a sprite (a test fails while the committed atlas differs from a fresh build). The atlas holds both packs' pixels, so both manifest entries list it. Which frame each kind is drawn with: `src/data/sprites.ts` (a tower draws its base, then its turret, which turns toward its target: #41); a kind without one (Helicopter), or any kind when the atlas fails to load, keeps its shape.

### Facing and movement (#42)

An enemy sprite turns to face the way it travels: `SPRITE_HEADING` in `src/data/sprites.ts` records which way each frame faces as drawn (the Tower Defense units face east, the Tanks body north), and the scene rotates it by its heading minus that. A new enemy frame needs its entry there. The movement animation (`ENEMY_ANIM` in `src/data/display.ts`) is a scale bob on the sprite, or the spin of the Helicopter's rotor; it runs on real time and is off with `?anim=0`.

### Alternatives considered

- **Kenney Top-Down Tanks** (older, CC0): fewer and smaller sprites; Remastered replaces it.
- **Kenney Tanks** (CC0): side view, doesn't fit a top-down map.
- **OpenGameArt.org** helicopters: the CC0 ones are side views; `apache-style-helicopter` is CC-BY-SA (not allowed). `chopper-44x99` is the only top-down one under an allowed license.
- **OpenGameArt.org** jeeps: *Army Jeep* / *German Jeep* (clayster2012) were rejected: one carries a swastika and the license isn't stated clearly.
- **Kenney Tower Defense** `td245`/`td247`/`td269` (first picks): at 48 px they don't read as a soldier or a jeep, so they were replaced.
- **itch.io free packs**: mostly "free for personal use", rejected.

## Sound effects (#45)

Downloaded 2026-11-02, CC0 only. kenney.nl wasn't reachable from the cloud session, so each pack comes from its author's own OpenGameArt upload. Only the `.ogg` files below are committed. Kenney's jingles keep the pack's `license.txt` (as `License.txt`); rubberduck's packs ship none, so their `License.txt` copies the source page's notice. The files were picked by name and length, not by ear: swap any that sound wrong in `src/data/sounds.ts`.

| Pack (`assets/<id>/`) | Source | Used for |
| --- | --- | --- |
| 100 CC0 SFX (`rubberduck-100-sfx`) | opengameart.org/content/100-cc0-sfx | leak (`bell_02`) |
| 85 Short music jingles (`kenney-jingles`) | opengameart.org/content/85-short-music-jingles | wave start, victory, defeat (`jingles_STEEL00`–`02`) |

The weapon shots, the shell explosion and the enemy death first used rubberduck's bang pack and `hit_02`. They're replaced by the weapon sounds below (#404).

## Weapon sounds (#404)

One sound per weapon, CC0 only, downloaded 2026-11-03 from OpenGameArt (Freesound isn't reachable from the cloud session). `scripts/weapon-fx.ts` (`npm run weapon-fx`, needs ffmpeg) builds `assets/weapon-sounds/<id>.ogg` from the committed inputs below: it layers, trims, re-pitches and filters them, and synthesizes the mortar's incoming whistle (a breathy note: noise through a narrow band-pass falling from 1.7 to 0.9 kHz, faster near impact, with a slight fin flutter, getting louder until the impact cuts it off), since no CC0 recording of one was found, and a sub-bass thump and a debris crackle that give the unit explosions their weight. `SHOT_SOUND` in `src/audio/sounds.ts` maps each tower kind × defender Faction to a sound (ADR-0009). The sounds were checked by spectrogram and level, not by ear.

| Sound | Plays for | Built from |
| --- | --- | --- |
| `rifleShot` | Rifle Nest | an AK-47 short burst over an AR-15 crack |
| `aaGunBurst` | AA Gun | one .30-06 report pitched down, 0.26 s: one sound per shot, so it keeps the gun's 3 to 3.75 shots a second |
| `missileLaunch` | Cannon: TOW (US), HJ-8 (China) | the missile launch whoosh, with a low eject thump |
| `gunReport` | Cannon: MT-12 (Russia) | the cannon shot, with a rifle's supersonic crack on top |
| `recoillessBlast` | Cannon: SPG-9 (Insurgents) | the cannon shot, lower and duller, with a backblast hiss |
| `mortarLaunch`, `mortarWhistle`, `mortarBlast` | Mortar: launch, incoming (0.5 s before impact), impact | a sharp light-mortar "tonk" (cannon shot plus a rifle crack); the synthesized falling, breathy whistle; `explosion3` with a crack, a thump and debris |
| `vehicleExplosion` | a jeep, tank or helicopter destroyed | `explosion1` at about half speed, a sub-bass thump, `explosion3` as a second blast and rumbling tail, a debris crackle |
| `infantryHit` | infantry killed | `explosion2`, short and light |

| Pack (`assets/<id>/`) | Source | Used for |
| --- | --- | --- |
| The Free Firearm Sound Library (`free-firearm-sfx`), by Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney | opengameart.org/content/the-free-firearm-sound-library | three one-take excerpts (AK-47 burst, AR-15 shot, Springfield 1917 shot) as 48 kHz FLAC; the 194 MB archive isn't committed |
| Missile Sound (`mikeask-missile`), by mikeask | opengameart.org/content/missile-sound | the missile launch |
| Cannon Fire (`thimras-cannon`), by Thimras | opengameart.org/content/cannon-fire | the gun, recoilless and mortar reports |
| Explosions (`ezduzziteh-explosions`), by EZduzziteh | opengameart.org/content/explosions-4 | the explosions |
| Weapon sounds (`weapon-sounds`) | the script's output | the ten sounds above |

Each source ships no license file, so its `License.txt` copies the source page's CC0 notice. Rejected: *Light Machine Gun* and *4 Projectile Launches* (CC-BY), *2 Big Gun Shots* and *Q009's weapon sounds* (CC-BY-SA), the *Whistles* items (CC-BY, and not shell whistles).

Volume falls off with distance from the camera's centre: full within 5 tiles, down to 35 % at 16 tiles (`SOUND_FALLOFF` in `src/data/sounds.ts`). Wave start, a leak and the end of the game play at full volume.

## Music (#66)

Downloaded 2026-11-02 from [War on Water tracks](https://opengameart.org/content/war-on-water-tracks) by yd, CC0-1.0 (`assets/yd-war-on-water/`, `License.txt` copies the page's notice). Two tracks, each as OGG Vorbis (played first) and an MP3 fallback for browsers without Vorbis:

| File | Source file | Plays on |
| --- | --- | --- |
| `menu.{ogg,mp3}` | `wowmenu.ogg` | Main menu, Level select, Settings, Credits |
| `game.{ogg,mp3}` | `wowchapter1.ogg` | the Game, End screen included |

Each had its trailing silence (~0.1 s) trimmed and a 10 ms fade at both ends (ffmpeg), so the loop has no gap or click. `trackFor` in `src/audio/music.ts` maps scenes to tracks; a change of track crossfades over 1 s. Music starts on the first input, is muted in test mode, and a file that fails to load stays silent.

## Candidate sources

- **Kenney** (kenney.nl): CC0. Tower Defense (Top-Down), Top-down Tanks Remastered (formerly Redux), UI Pack, Impact/Interface sounds, Music Jingles.
- **OpenGameArt.org**: mixed licenses. Check each item.
- **itch.io free asset packs**: mixed licenses. Many are "free for personal use" only, which isn't allowed here.

## Render spike (#286, ADR-0009)

Three packs hold the art-style spike: top-down renders of two CC-BY Sketchfab models and one NAIP ground patch (`docs/art/render-spike-compare.png`). The game draws the AA Gun and Tank renders in place of their Kenney sprites (#310): the hull with its shadow, then the turret turning around its pivot. After `render-sprite.py`, run `npm run render:pivot`: it measures each turret's pivot (the centre of its body, without the barrel) from `<id>-turret.png` into `<id>.json`, which `src/data/renders.ts` reads. A test fails while that JSON is stale. A kind whose render doesn't load keeps its Kenney frame. Source models are never committed: `scripts/render-sprite.py` downloads them into the ignored `.cache/models/` with `SKETCHFAB_API_TOKEN`.

| Folder | Source | Made by |
| --- | --- | --- |
| `render-china-aa-gun/` | "Oerlikon Gdf-006 35mm" by lm9241221, CC-BY-4.0 | `scripts/render-sprite.py` (`render-sprite.json`) |
| `render-russia-tank/` | "T-72B3 Main Battle Tank" by MirzaArrafiERV_45, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-rifle-nest/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-aa-gun/` | "Phalanx CIWS" by Lemper_Studio, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-cannon/` | "Anti-Tank Guided Missile" by Alhimix, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-mortar/` | "Mortar - M224" by jcherry3d, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-infantry/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-jeep/` | "Low Poly Humvee FREE" by madtrollstudio, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-tank/` | "M1A2 Abrams Crows" by MirzaArrafiERV_45, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-us-helicopter/` | "Sikorsky UH-60 Black Hawk" by helijah, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-russia-rifle-nest/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-russia-aa-gun/` | "ZU - 23, зенитная установка, ЗУ-23, зенитка" by LuckySkink9661, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-russia-cannon/` | "ZiS-2 57mm anti-tank gun" by sergey.s.filin, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-russia-mortar/` | "Pindad Mortars" by sakigakefuruzawa, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-russia-infantry/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-russia-jeep/` | "UAZ-469 Low Poly" by lebedeventerprise, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-russia-helicopter/` | "Mi-8" by tiunov.se, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-china-rifle-nest/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-china-cannon/` | "Anti-Tank Guided Missile" by Alhimix, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-china-mortar/` | "Pindad Mortars" by sakigakefuruzawa, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-china-infantry/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-china-jeep/` | "Military Jeep Low Poly – Game Ready 3D Vehicle" by KidBi-Gaming, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-china-tank/` | "Type 99 MBT" by philano, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-china-helicopter/` | "Sikorsky UH-60M Blackhawk" by MirzaArrafiERV_45, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-rifle-nest/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-cannon/` | "SPG-9" by Jack512kb, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-aa-gun/` | "ZU - 23, зенитная установка, ЗУ-23, зенитка" by LuckySkink9661, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-mortar/` | "Pindad Mortars" by sakigakefuruzawa, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-infantry/` | "Tactical Soldier (game ready) low poly" by MissingTray1151, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-jeep/` | "TOYOTA DO AFEGANISTÃO (LOW POLY)" by lm9241221, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-tank/` | "T 54/55 Tank" by SGAstudios3DandGameDevelopment, CC-BY-4.0 | `scripts/render-sprite.py` |
| `render-insurgents-helicopter/` | "Russian Transport Heli" by jeandiz, CC-BY-4.0 | `scripts/render-sprite.py` |
| `naip-field-road-treeline/` | USDA FSA NAIP, Iowa 2023, 0.3 m, PD-USGov | `scripts/naip-patch.py` |

The **US** Faction's set (#314, the first map's Defender) is complete: all eight kinds, previewed on NAIP grass at 48 and 128 px in `docs/art/faction-us.png` (`scripts/faction-sheet.py us`). The game doesn't draw it yet: per ADR-0009 point 5 a Faction leaves Kenney in one step, which is the sprite loader's job. Towers stand on a sandbagged pad that `render-sprite.py` builds itself (`base`), so they read on grass; `render:pivot` turns such a tower about the pad centre (the canvas centre) instead of measuring a barrel. Infantry, Jeep and Helicopter have no turret layer (no `turret` in `render-sprite.json`), so their render data has no pivot.

The **Russia** Faction's set (#315, the first map's Attacker) is complete too, so the first map's pairing is: the spike's T-72B3 plus seven new renders, previewed in `docs/art/faction-russia.png` (`scripts/faction-sheet.py russia`). Where no free model of the exact variant exists, `depicts` in `render-sprite.json` names the stand-in (ZiS-2 for the MT-12, Pindad MO-3 for the 2B14, Mi-8 for the Mi-8AMTSh). Rifle Nest and Infantry reuse the US soldier model, its kit tinted olive. The ZiS-2 model sits at an angle, so its entry turns it north with `turnDeg`.

The **China** Faction's set (#316) is complete as well: the spike's GDF-006, now on the same sandbagged pad as the other towers (the game's AA Gun draws this render, so it gains the pad), plus seven new renders, previewed in `docs/art/faction-china.png` (`scripts/faction-sheet.py china`). Stand-ins, named in `depicts`: GDF-006 for the PG-99, the tripod ATGM for the HJ-8, Pindad MO-3 for the PP-87, a UH-60M for the Z-20 (built to the UH-60's layout), Type 99 for the Type 99A, and an open-top military 4×4 (machine gun removed, repainted olive) for the BJ2022. Rifle Nest, Infantry and the ATGM reuse models from the other sets, tinted green. Sketchfab uploads that say they were ripped from a game (several PLA vehicles, e.g. a War Thunder ZTZ-99A and a Mercenaries 2 BJ2022) were skipped: their uploader can't license them.

The **Insurgents** Faction's set (#317) completes all four, so every Faction has its 8 kinds (`tests/render-pivot.test.ts` checks each Faction in `FACTIONS`). It is previewed in `docs/art/faction-insurgents.png` (`scripts/faction-sheet.py insurgents`). The T-55 (the "T 54/55 Tank" model, desert sand), a weathered bare-metal Mi-8, a Toyota pickup technical with a heavy machine gun in the bed (its ground disc removed, brightened) and the SPG-9 (untextured, painted olive) are new models. The others are reused: the ZU-23-2 repainted sand stands in for the ZPU-4 (no free ZPU-4 exists, and insurgents field the ZU-23-2 as widely), the Pindad MO-3 is the mortar, and Rifle Nest and Infantry use the soldier model with its kit re-coloured to civilian browns and denim (the free Taliban figures are T-posed with no animations). Skipped: 42manako's T-55AM ("ripped from WARNO"), an "Insurgent" figure tagged Escape from Tarkov, and Sleepykingzzz's twin DShK emplacements, whose gun texture is named `textures\wpn\wpn_dshk` (S.T.A.L.K.E.R.'s naming), a sign it came from a game. Look at a model's material and texture names too, not just its page.

## Map ground images (#312, ADR-0009)

Each Tiled map can have one painted ground image in `naip-maps/` (`<map>.jpg`, PD-USGov, under the same NAIP manifest entry). `scripts/naip-map.py` makes it: a pinned NAIP field at 30 m per tile, 96 px per tile, with the map's Path painted on it as a dirt track and blocked tiles as treeline. A new map is a new entry in that script's `MAPS`; rerun it after moving the Path. The scene, the window centres and the seed are pinned, so a rerun writes the same file.

Before rendering a Sketchfab model, read its page: skip it if the description or tags say "ripped" or "imported from", name a game, or the license is NonCommercial or NoDerivatives.

# 9. Satellite-style milsim art and factions per map

Date: 2026-10-27 · Status: Proposed (accepted once the maintainer approves the look from the spike, #286)

## Context

The rules aim at realism (ADR-0007): armor, shell flight time, Minimum range. The maintainer wants the game to look like it plays, a milsim tower defense in the spirit of Arma. The first art (#39) is Kenney's CC0 cartoon set: good placeholders, but not that look.

Free realistic top-down military art under our licenses (CC0, CC-BY; `docs/assets.md`) barely exists. Realistic art also clashes with readability: at true scale a soldier is about 3 px wide on a 48 px tile.

The maintainer also wants each map to pit two sides against each other, picked from US, Russia, China and a GLA-style insurgent faction. Arma's own factions, for reference: Arma 3 has NATO, CSAT (Iran-led; CSAT Pacific is Chinese-styled), AAF, FIA, LDF and Syndikat. Arma 2 / Operation Arrowhead have USMC, US Army, Russia, ChDKZ, CDF, the Takistani Army and Takistani Militia. Arma Reforger has the US, the USSR and FIA.

## Decision

1. **Look: aerial photo, seen from straight above.**
   - Ground tiles come from USGS **NAIP** aerial imagery (public domain, about 0.6 m per pixel): fields, dirt roads, treelines. Sentinel-2 (10 m) is too coarse.
   - Towers and units are **top-down renders of real equipment**: CC0/CC-BY 3D models rendered orthographically by a headless Blender script (`bpy`), with a fixed sun from the top-left, a soft ground shadow and a slight desaturation, so every sprite matches. Turret and hull render as separate layers so turrets can rotate.
   - The script and its inputs are committed, so any sprite can be re-rendered and checked (ADR-0003).
2. **Readable before true to scale** (ADR-0007, point 4). Sizes follow real ones but small things are enlarged: a soldier about 0.4 tile, a light vehicle 0.75, a tank about 1, a helicopter 1.2. Muzzle flashes, tracers and impact smoke make the action read.
3. **Factions are visual skins.** Four factions: **US**, **Russia**, **China** and **Insurgents** (a GLA-style militia). Each map names its attacker and its defender. A kind keeps the same stats in every faction, so ADR-0007's balance and the counter matrix test hold for every pairing. Only sprites, names in the art description, and later sounds change.
4. **Legal guardrails.**
   - In-game names stay generic (Tank, Jeep, AA Gun). Real designations (M1A2, T-72B3) appear only in art descriptions and docs.
   - No logos or names from other games: the insurgent faction is not called GLA and uses no C&C Generals insignia (EA's IP).
   - No real national insignia on enemy units beyond plain camouflage patterns and simple markings.
5. **Kenney art stays as placeholders** until a faction's realistic set is complete, so the game never mixes styles on one map.

### What each kind depicts

| Kind | US | Russia | China | Insurgents |
| --- | --- | --- | --- | --- |
| **Rifle Nest** | Sandbagged fighting position, M4A1 and M249, OCP camo | AK-12 and PKP, EMR camo | QBZ-191 and QJY-88, Type 07 camo | AKM and PKM, mixed civilian clothes |
| **AA Gun** | M167 VADS (towed 20 mm Vulcan) | ZU-23-2 (twin 23 mm) | PG-99 / Type 90 (twin 35 mm) | ZPU-4 (quad 14.5 mm) |
| **Cannon** (anti-tank) | M220 TOW on a tripod | MT-12 Rapira (100 mm towed AT gun) | HJ-8 on a tripod | SPG-9 recoilless rifle |
| **Mortar** | M252 81 mm, crew of 3 | 2B14 Podnos 82 mm | PP-87 82 mm | 82 mm mortar in a dug pit |
| **Infantry** | Rifleman, M4A1, IOTV, OCP | Rifleman, AK-12, Ratnik kit, EMR | Rifleman, QBZ-191, Type 07 | Fighter, AKM, chest rig, shemagh |
| **Jeep** (unarmored, fast) | M1097 soft-top Humvee | UAZ-469 | BJ2022 Brave Warrior | Toyota Hilux technical with a DShK |
| **Tank** | M1A2 SEPv3 Abrams | T-72B3 | Type 99A | T-55 (captured) |
| **Helicopter** (light armor) | UH-60 Black Hawk | Mi-8AMTSh | Z-20 | Mi-8 (captured) |

Picks match the stats: the Jeep has no armor (so no armored Humvee or Tigr), the Helicopter has light armor (a transport, not an Apache or Hind), and the AA Gun is a fast-firing gun that also hits ground targets.

## Consequences

- Art becomes a pipeline (models in, sprites out) rather than picking packs. Each kind needs one model per faction: 32 in total. CC-BY models need their attribution in `CREDITS.md`, as any asset does.
- Maps get two faction fields; the sprite loader (#40) picks sprites by faction. Rules in `src/sim` don't change.
- Follow-ups: the render spike (#286); the faction data and map fields; one sprite set per faction; NAIP-based tilesets for the Tiled maps (ADR-0006).
- If the spike's look doesn't convince, this ADR is rejected and the Kenney set stays as the final art.

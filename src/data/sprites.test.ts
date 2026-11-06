import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from './enemies';
import { SPRITES, TOWER_BASES, TURRET_FACING, spriteFor, towerIcon } from './sprites';
import { TOWER_STATS } from './towers';

/** Tower kinds drawn with Kenney frames; the rest keep their shape. */
const TOWERS_WITH_SPRITES = (Object.keys(TOWER_STATS) as (keyof typeof TOWER_STATS)[]).filter(
  (kind) => spriteFor(kind) !== null,
);

const atlas = JSON.parse(readFileSync('assets/atlas/sprites.json', 'utf8')) as { frames: Record<string, unknown> };

describe('spriteFor', () => {
  it('has an entry for every tower kind and enemy kind', () => {
    const kinds = [...Object.keys(TOWER_STATS), ...Object.keys(ENEMY_STATS)].sort();
    expect(Object.keys(SPRITES).sort()).toEqual(kinds);
  });

  it('names only frames the atlas has', () => {
    for (const kind of Object.keys(SPRITES) as (keyof typeof SPRITES)[]) {
      const frame = spriteFor(kind);
      if (frame !== null) expect(Object.keys(atlas.frames), kind).toContain(frame);
    }
  });

  it('has no sprite for the Helicopter: no pack has a rotorcraft, so it keeps its shape', () => {
    expect(spriteFor('helicopter')).toBeNull();
  });

  it('gives every tower kind with a sprite a base and a turret frame the atlas has', () => {
    for (const kind of TOWERS_WITH_SPRITES) {
      expect(Object.keys(atlas.frames), kind).toContain(TOWER_BASES[kind]);
      expect(Object.keys(atlas.frames), kind).toContain(spriteFor(kind));
      expect(TURRET_FACING[kind], kind).toBeTypeOf('number');
    }
  });
});

describe('towerIcon', () => {
  it('gives every tower kind with a sprite its base and turret frames, both in the atlas', () => {
    for (const kind of TOWERS_WITH_SPRITES) {
      const icon = towerIcon(kind)!;
      expect(icon.base, kind).toBe(TOWER_BASES[kind]);
      expect(icon.turret, kind).toBe(spriteFor(kind));
      expect(Object.keys(atlas.frames), kind).toContain(icon.base);
      expect(Object.keys(atlas.frames), kind).toContain(icon.turret);
    }
  });

  it('has no icon for a kind without a sprite: the grenade launcher keeps its shape until its renders land', () => {
    expect(spriteFor('grenadeLauncher')).toBeNull();
    expect(TOWER_BASES.grenadeLauncher).toBeNull();
    expect(towerIcon('grenadeLauncher')).toBeNull();
  });

  it('turns a turret to point north: the east-facing soldier a quarter turn left, the barrels not at all', () => {
    expect(towerIcon('rifleNest')!.turretRotation).toBeCloseTo(-Math.PI / 2);
    expect(towerIcon('cannon')!.turretRotation).toBeCloseTo(0);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from './enemies';
import { SPRITES, TILE_TYPES, spriteFor } from './sprites';
import { TOWER_STATS } from './towers';

const atlas = JSON.parse(readFileSync('assets/atlas/sprites.json', 'utf8')) as { frames: Record<string, unknown> };

describe('spriteFor', () => {
  it('has an entry for every tower kind, enemy kind and tile type', () => {
    const kinds = [...Object.keys(TOWER_STATS), ...Object.keys(ENEMY_STATS), ...TILE_TYPES].sort();
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

  it('gives the Path and buildable tiles different frames', () => {
    expect(spriteFor('path')).not.toBe(spriteFor('buildable'));
  });
});

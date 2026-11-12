import { describe, expect, it } from 'vitest';
import { ENEMY_NAMES, ENEMY_WEAKNESS } from './display';
import { ENEMY_STATS, NOT_PLAYABLE_KINDS } from './enemies';
import { HAIRPIN_WAVES, SERPENTINE_WAVES, SWITCHBACK_WAVES, WAVES } from './waves';

describe('jet', () => {
  it('is a fast, fragile, unarmored air unit', () => {
    expect(ENEMY_STATS.jet).toEqual({ maxHp: 40, speed: 5, reward: 6, leakCost: 2, armor: 0, layer: 'air' });
  });
  it('has a name and role line', () => {
    expect(ENEMY_NAMES.jet).toBe('Jet');
    expect(ENEMY_WEAKNESS.jet).toBe('Fast, fragile jet. Needs AA coverage along the route.');
  });
  it('is in play on maps 2–4, not on the Training Ground (#366)', () => {
    expect(NOT_PLAYABLE_KINDS).not.toContain('jet');
    const kinds = (waves: typeof WAVES) => waves.flatMap((w) => w.groups.map((g) => g.kind));
    expect(kinds(WAVES)).not.toContain('jet');
    for (const waves of [SWITCHBACK_WAVES, SERPENTINE_WAVES, HAIRPIN_WAVES]) expect(kinds(waves)).toContain('jet');
  });
});

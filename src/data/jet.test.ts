import { describe, expect, it } from 'vitest';
import { ENEMY_NAMES, ENEMY_WEAKNESS } from './display';
import { ENEMY_STATS } from './enemies';
import { HAIRPIN_WAVES, SERPENTINE_WAVES, SWITCHBACK_WAVES, WAVES } from './waves';

describe('jet', () => {
  it('is a fast, fragile, unarmored air unit', () => {
    expect(ENEMY_STATS.jet).toEqual({ maxHp: 40, speed: 5, reward: 6, leakCost: 2, armor: 0, layer: 'air' });
  });
  it('has a name and role line', () => {
    expect(ENEMY_NAMES.jet).toBe('Jet');
    expect(ENEMY_WEAKNESS.jet).toBe('Fast, fragile jet. Needs AA coverage along the route.');
  });
  it('is in no map wave yet (ADR-0009)', () => {
    expect(JSON.stringify([WAVES, SWITCHBACK_WAVES, SERPENTINE_WAVES, HAIRPIN_WAVES])).not.toContain('"jet"');
  });
});

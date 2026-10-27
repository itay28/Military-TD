import { describe, expect, it } from 'vitest';
import { damageTaken } from '../sim/combat';
import { ENEMY_STYLE } from './display';
import { ENEMY_STATS } from './enemies';
import { TOWER_STATS } from './towers';

describe('tank', () => {
  it('has the starting numbers: heavy, slow, armored, ground', () => {
    expect(ENEMY_STATS.tank).toEqual({ maxHp: 250, speed: 0.6, reward: 25, leakCost: 5, armor: 8, layer: 'ground' });
  });

  it('is drawn bigger than Infantry, in its own color', () => {
    expect(ENEMY_STYLE.tank.radius).toBeGreaterThan(ENEMY_STYLE.infantry.radius);
    expect(ENEMY_STYLE.tank.color).not.toBe(ENEMY_STYLE.infantry.color);
  });

  it('takes only 2 from a Rifle Nest hit', () => {
    const { damage } = TOWER_STATS.rifleNest;
    const { armor, maxHp } = ENEMY_STATS.tank;
    expect(damageTaken(damage, armor, 0, maxHp)).toBe(2);
  });
});

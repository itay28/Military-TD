import { describe, expect, it } from 'vitest';
import { ENEMY_STYLE } from './display';
import { ENEMY_STATS } from './enemies';
import { TOWER_STATS } from './towers';

describe('tank', () => {
  it('has the starting numbers: heavy, slow, armored, ground', () => {
    expect(ENEMY_STATS.tank).toEqual({ maxHp: 200, speed: 0.6, reward: 25, leakCost: 5, armor: 5, layer: 'ground' });
  });

  it('is drawn bigger than Infantry, in its own color', () => {
    expect(ENEMY_STYLE.tank.radius).toBeGreaterThan(ENEMY_STYLE.infantry.radius);
    expect(ENEMY_STYLE.tank.color).not.toBe(ENEMY_STYLE.infantry.color);
  });

  it('takes 5 off a Rifle Nest hit', () => {
    expect(TOWER_STATS.rifleNest.damage - ENEMY_STATS.tank.armor).toBe(5);
  });
});

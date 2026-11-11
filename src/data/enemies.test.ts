import { describe, expect, it } from 'vitest';
import { damageTaken } from '../sim/combat';
import { ENEMY_STYLE } from './display';
import { ENEMY_STATS, NOT_IN_PLAY } from './enemies';
import { TOWER_STATS } from './towers';

describe('heavyTank (boss)', () => {
  it('has the boss numbers: ground, armor 12, huge HP, slow, leak cost 10', () => {
    expect(ENEMY_STATS.heavyTank).toEqual({
      maxHp: 1500,
      speed: 0.4,
      reward: 120,
      leakCost: 10,
      armor: 12,
      layer: 'ground',
      boss: true,
    });
  });

  it('are the bosses, and armor 12 sits above the Cannon pierce but still takes damage from it', () => {
    const bosses = Object.entries(ENEMY_STATS).filter(([, s]) => 'boss' in s && s.boss);
    expect(bosses.map(([k]) => k)).toEqual(['heavyTank', 'gunship']);
    const { damage, armorPierce } = TOWER_STATS.cannon;
    expect(ENEMY_STATS.heavyTank.armor).toBeGreaterThan(armorPierce);
    expect(damageTaken(damage, ENEMY_STATS.heavyTank.armor, armorPierce, ENEMY_STATS.heavyTank.maxHp)).toBeGreaterThan(
      1,
    );
  });
});

describe('gunship (boss)', () => {
  it('has the boss numbers: air, armor 6, about 1200 HP, leak cost 10', () => {
    expect(ENEMY_STATS.gunship).toEqual({
      maxHp: 1200,
      speed: 0.8,
      reward: 100,
      leakCost: 10,
      armor: 6,
      layer: 'air',
      boss: true,
    });
  });

  it('is not in play yet', () => {
    expect(NOT_IN_PLAY.has('gunship')).toBe(true);
  });
});

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

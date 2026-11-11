import { describe, expect, it } from 'vitest';
import { towerLevels } from '../sim/towers';
import { LEVEL_NAME } from './display';
import { BUILD_KINDS, NOT_IN_PLAY, TOWER_STATS, type TowerKind } from './towers';

const KINDS = Object.keys(TOWER_STATS) as TowerKind[];

describe('tower levels', () => {
  it('Rifle Nest: optics for 40 (range 3), then a heavier weapon for 70 (16 damage, 2.5/s)', () => {
    expect(towerLevels('rifleNest')).toEqual([
      { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
      { cost: 40, range: 3, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
      { cost: 70, range: 3, fireRate: 2.5, damage: 16, targets: ['ground', 'air'] },
    ]);
  });

  it('Sniper: optics for 88 (range 6.5), then a heavier rifle for 154 (112 damage, 0.5/s)', () => {
    const sniper = { armorPierce: 4, targets: ['ground'], targeting: 'strongest' };
    expect(towerLevels('sniper')).toEqual([
      { ...sniper, cost: 110, range: 6, fireRate: 0.4, damage: 70 },
      { ...sniper, cost: 88, range: 6.5, fireRate: 0.4, damage: 70 },
      { ...sniper, cost: 154, range: 6.5, fireRate: 0.5, damage: 112 },
    ]);
  });

  it.each(KINDS)('%s: level 1 is TOWER_STATS, and there are two upgrades', (kind) => {
    const levels = towerLevels(kind);
    expect(levels[0]).toBe(TOWER_STATS[kind]);
    expect(levels).toHaveLength(3);
  });

  it.each(KINDS)('%s: each level costs more than 0 and is at least as strong as the one before', (kind) => {
    const levels = towerLevels(kind);
    for (const [i, level] of levels.entries()) {
      expect(level.cost).toBeGreaterThan(0);
      const before = levels[i - 1];
      if (!before) continue;
      expect(level.damage).toBeGreaterThanOrEqual(before.damage);
      expect(level.fireRate).toBeGreaterThanOrEqual(before.fireRate);
      expect(level.range).toBeGreaterThanOrEqual(before.range);
      expect(level.armorPierce ?? 0).toBeGreaterThanOrEqual(before.armorPierce ?? 0);
      expect(level.targets).toEqual(expect.arrayContaining([...before.targets]));
    }
  });

  // Optics push the max range out; the dead zone inside a minimum range (Mortar, #31) stays where it was.
  it.each(KINDS)('%s: upgrades never change the minimum range', (kind) => {
    const minRange = (stats: object) => ('minRange' in stats ? stats.minRange : undefined);
    const [first, ...rest] = towerLevels(kind);
    for (const level of rest) expect(minRange(level)).toBe(minRange(first!));
  });

  it.each(KINDS)('%s: every level above 1 has a name', (kind) => {
    for (let level = 2; level <= towerLevels(kind).length; level++) expect(LEVEL_NAME[level]).toBeTruthy();
  });
});

describe('kinds in play', () => {
  // ADR-0009: a kind reaches the build bar in its rollout issue, once its renders land (the Sniper's: #364).
  it('the build kinds are every kind not held back, in TOWER_STATS order; the Sniper is held back', () => {
    expect(NOT_IN_PLAY.has('sniper')).toBe(true);
    expect(BUILD_KINDS).toEqual(KINDS.filter((kind) => !NOT_IN_PLAY.has(kind)));
    expect(BUILD_KINDS).toEqual(['rifleNest', 'aaGun', 'cannon', 'mortar']);
  });
});

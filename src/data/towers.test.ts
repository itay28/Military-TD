import { describe, expect, it } from 'vitest';
import { towerLevels } from '../sim/towers';
import { LEVEL_NAME } from './display';
import { IN_PLAY_TOWERS, TOWER_STATS, TURN_RATES, type TowerKind } from './towers';

const KINDS = Object.keys(TOWER_STATS) as TowerKind[];

describe('tower levels', () => {
  it('Rifle Nest: optics for 40 (range 3), then a heavier weapon for 70 (16 damage, 2.5/s)', () => {
    expect(towerLevels('rifleNest')).toEqual([
      { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
      { cost: 40, range: 3, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
      { cost: 70, range: 3, fireRate: 2.5, damage: 16, targets: ['ground', 'air'] },
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

describe('automatic grenade launcher (#75)', () => {
  const gl = TOWER_STATS.grenadeLauncher;
  const mortar = TOWER_STATS.mortar;

  it('fires fast, small-blast grenades on the ground, with no minimum range', () => {
    expect(gl).toEqual({
      cost: 90,
      range: 3,
      fireRate: 1.5,
      damage: 14,
      targets: ['ground'],
      shell: { flightMs: 400, innerRadius: 0.35, outerRadius: 0.7 },
    });
  });

  it('upgrades range at level 2, then damage and fire rate at level 3', () => {
    const [, two, three] = towerLevels('grenadeLauncher');
    expect(two).toEqual({ ...gl, cost: 72, range: 3.5 });
    expect(three).toEqual({ ...gl, cost: 126, range: 3.5, fireRate: 1.875, damage: 22.4 });
  });

  it('differs from the Mortar: shorter range, no dead zone, faster fire, smaller blast, shorter flight', () => {
    expect(gl.range).toBeLessThan(mortar.range);
    expect('minRange' in gl).toBe(false);
    expect(gl.fireRate).toBeGreaterThan(mortar.fireRate);
    expect(gl.damage).toBeLessThan(mortar.damage);
    expect(gl.shell.innerRadius).toBeLessThan(mortar.shell.innerRadius);
    expect(gl.shell.outerRadius).toBeLessThan(mortar.shell.outerRadius);
    expect(gl.shell.flightMs).toBeLessThan(mortar.shell.flightMs);
    expect(gl.cost).toBeLessThan(mortar.cost);
  });

  it('turns to aim: a direct-fire weapon on a tripod, unlike the Mortar', () => {
    expect(TURN_RATES.grenadeLauncher).toBeGreaterThan(0);
  });

  it('is not in play yet (ADR-0009: it waits for its renders, #365)', () => {
    expect(IN_PLAY_TOWERS).not.toContain('grenadeLauncher');
    expect(IN_PLAY_TOWERS).toEqual(['rifleNest', 'aaGun', 'cannon', 'mortar']);
  });
});

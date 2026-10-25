import { describe, expect, it } from 'vitest';
import type { Enemy } from './enemies';
import { landShells, type Shell } from './shells';

const enemy = (id: number, x: number, over: Partial<Enemy> = {}): Enemy => ({
  id,
  kind: 'infantry',
  maxHp: 30,
  hp: 30,
  speed: 1.5,
  reward: 5,
  leakCost: 1,
  armor: 0,
  layer: 'ground',
  distance: 0,
  position: { x, y: 0 },
  ...over,
});

const shell = (id: number, over: Partial<Shell> = {}): Shell => ({
  id,
  towerId: 1,
  from: { x: 0, y: 0 },
  target: { x: 10, y: 0 },
  firedAtMs: 0,
  landsAtMs: 1000,
  damage: 20,
  armorPierce: 0,
  targets: ['ground'],
  flightMs: 1000,
  innerRadius: 1,
  outerRadius: 2,
  ...over,
});

describe('landShells', () => {
  it('a shell in flight stays in flight and hurts nobody', () => {
    const result = landShells([shell(1)], [enemy(1, 10)], 999);
    expect(result.shells).toHaveLength(1);
    expect(result.landed).toEqual([]);
    expect(result.enemies[0]!.hp).toBe(30);
  });

  it('a shell lands at landsAtMs, at the position it was aimed at', () => {
    const result = landShells([shell(1)], [], 1000);
    expect(result.shells).toEqual([]);
    expect(result.landed).toEqual([{ shellId: 1, towerId: 1, position: { x: 10, y: 0 }, hits: [] }]);
  });

  it('full damage inside the inner ring, half in the outer ring, none outside', () => {
    const enemies = [enemy(1, 10.5), enemy(2, 11), enemy(3, 11.5), enemy(4, 12), enemy(5, 12.1)];
    const result = landShells([shell(1)], enemies, 1000);
    expect(result.landed[0]!.hits).toEqual([
      { enemyId: 1, damage: 20 },
      { enemyId: 2, damage: 20 },
      { enemyId: 3, damage: 10 },
      { enemyId: 4, damage: 10 },
    ]);
    expect(result.enemies.map((e) => e.hp)).toEqual([10, 10, 20, 20, 30]);
  });

  it('half damage rounds down, and armor comes off each ring', () => {
    const odd = landShells([shell(1, { damage: 15 })], [enemy(1, 11.5)], 1000);
    expect(odd.landed[0]!.hits).toEqual([{ enemyId: 1, damage: 7 }]);
    const armored = landShells([shell(1)], [enemy(1, 10, { armor: 4 }), enemy(2, 11.5, { armor: 4 })], 1000);
    expect(armored.landed[0]!.hits).toEqual([
      { enemyId: 1, damage: 16 },
      { enemyId: 2, damage: 6 },
    ]);
    const heavy = landShells([shell(1)], [enemy(1, 11.5, { armor: 50 })], 1000);
    expect(heavy.landed[0]!.hits).toEqual([{ enemyId: 1, damage: 1 }]);
  });

  it('armor pierce cancels armor', () => {
    const result = landShells([shell(1, { armorPierce: 4 })], [enemy(1, 10, { armor: 4 })], 1000);
    expect(result.landed[0]!.hits).toEqual([{ enemyId: 1, damage: 20 }]);
  });

  it('only hits the layers its tower targets', () => {
    const result = landShells([shell(1)], [enemy(1, 10, { layer: 'air' }), enemy(2, 10)], 1000);
    expect(result.landed[0]!.hits.map((h) => h.enemyId)).toEqual([2]);
  });

  it('kills are removed and returned, with damage capped at HP left', () => {
    const result = landShells([shell(1)], [enemy(1, 10, { hp: 5 }), enemy(2, 10)], 1000);
    expect(result.landed[0]!.hits[0]).toEqual({ enemyId: 1, damage: 5 });
    expect(result.enemies.map((e) => e.id)).toEqual([2]);
    expect(result.kills.map((e) => e.id)).toEqual([1]);
  });

  it('shells landing in the same tick land in fire order, the second seeing the first’s kills', () => {
    const result = landShells([shell(1), shell(2)], [enemy(1, 10, { hp: 20 })], 1000);
    expect(result.landed.map((l) => l.shellId)).toEqual([1, 2]);
    expect(result.landed[0]!.hits).toEqual([{ enemyId: 1, damage: 20 }]);
    expect(result.landed[1]!.hits).toEqual([]);
    expect(result.kills).toHaveLength(1);
  });

  it('a shell lands with no tower around: it carries what it needs', () => {
    expect(landShells([shell(1, { towerId: 99 })], [enemy(1, 10)], 1000).landed).toHaveLength(1);
  });

  it('a fast enemy that walked out of the outer ring before landing is not hit', () => {
    const result = landShells([shell(1)], [enemy(1, 12.5), enemy(2, 10.2)], 1000);
    expect(result.landed[0]!.hits.map((h) => h.enemyId)).toEqual([2]);
  });
});

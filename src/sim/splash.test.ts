import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import type { Enemy } from './enemies';
import { fireTowers, type Tower } from './towers';

// The tower stands on tile (2, 2), center (2.5, 2.5), range 2.5. Enemies sit on y = 1.5 at x = 0.5 + distance.
const cannon = (stats: Partial<Tower> = {}): Tower => ({
  id: 1,
  kind: 'rifleNest',
  tile: { col: 2, row: 2 },
  cost: 100,
  range: 2.5,
  fireRate: 0.5,
  damage: 30,
  targets: ['ground'],
  splashRadius: 1,
  cooldownMs: 0,
  ...stats,
});

const enemy = (id: number, distance: number, stats: Partial<Enemy> = {}): Enemy => ({
  ...ENEMY_STATS.infantry,
  id,
  kind: 'infantry',
  hp: 100,
  distance,
  position: { x: 0.5 + distance, y: 1.5 },
  ...stats,
});

describe('splash', () => {
  it('hits every enemy within the radius of the target, target first, and none outside it', () => {
    // Target is #4 (furthest along). #3 is 0.4 behind it, #2 exactly 1 (the edge), #1 is 2 behind.
    const fired = fireTowers([cannon()], [enemy(1, 1), enemy(2, 2), enemy(3, 2.6), enemy(4, 3)], 0);
    expect(fired.shots).toHaveLength(1);
    expect(fired.shots[0]!.targetId).toBe(4);
    expect(fired.shots[0]!.hits[0]!.enemyId).toBe(4);
    expect(fired.shots[0]!.hits.map((h) => h.enemyId).sort()).toEqual([2, 3, 4]);
    expect(fired.enemies.find((e) => e.id === 1)!.hp).toBe(100);
    expect(fired.enemies.find((e) => e.id === 2)!.hp).toBe(70);
  });

  it("takes off each enemy's own armor", () => {
    const fired = fireTowers([cannon({ damage: 10 })], [enemy(1, 1.5, { armor: 4 }), enemy(2, 2)], 0);
    expect(fired.shots[0]!.hits).toEqual([
      { enemyId: 2, damage: 10 },
      { enemyId: 1, damage: 6 },
    ]);
  });

  it('never hits a layer the tower cannot target', () => {
    const fired = fireTowers([cannon()], [enemy(1, 1.5, { layer: 'air' }), enemy(2, 2)], 0);
    expect(fired.shots[0]!.hits.map((h) => h.enemyId)).toEqual([2]);
    expect(fired.enemies.find((e) => e.id === 1)!.hp).toBe(100);
  });

  it('lists every kill from one shell', () => {
    const fired = fireTowers([cannon()], [enemy(1, 1.5, { hp: 5 }), enemy(2, 2, { hp: 5 })], 0);
    expect(fired.kills.map((e) => e.id).sort()).toEqual([1, 2]);
    expect(fired.enemies).toEqual([]);
  });

  it('a tower without splashRadius hits only its target', () => {
    const plain: Tower = { ...cannon(), splashRadius: undefined } as unknown as Tower;
    const fired = fireTowers([plain], [enemy(1, 1.5), enemy(2, 2)], 0);
    expect(fired.shots[0]!.hits.map((h) => h.enemyId)).toEqual([2]);
  });
});

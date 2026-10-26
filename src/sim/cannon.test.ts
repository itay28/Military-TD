import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import { TOWER_STATS } from '../data/towers';
import type { Enemy } from './enemies';
import { TICK_MS } from './game';
import { fireTowers, type Tower } from './towers';

// No armored or airborne enemy kind exists yet (Tank: #33), so enemies are built by hand.
// Towers stand on tile (2, 2), center (2.5, 2.5); enemies sit on y = 1.5, within both towers' range.
const tower = (id: number, kind: 'cannon' | 'rifleNest'): Tower => ({
  ...TOWER_STATS[kind],
  id,
  kind,
  tile: { col: 2, row: 2 },
  cooldownMs: 0,
});

const enemy = (id: number, stats: Partial<Enemy> = {}): Enemy => ({
  ...ENEMY_STATS.infantry,
  id,
  kind: 'infantry',
  hp: ENEMY_STATS.infantry.maxHp,
  distance: 2,
  position: { x: 2.5, y: 1.5 },
  ...stats,
});

/** A Tank stand-in: armor 5, 150 HP. A Rifle Nest does it 5 a hit; a Cannon, 60. */
const tank = (id: number): Enemy => enemy(id, { armor: 5, hp: 150, maxHp: 150 });

describe('Cannon', () => {
  it('has its starting stats: anti-tank, ground only', () => {
    expect(TOWER_STATS.cannon).toEqual({
      cost: 100,
      range: 3,
      fireRate: 0.5,
      damage: 60,
      armorPierce: 5,
      targets: ['ground'],
    });
  });

  it('does its full 60 to a Tank: armor 5 is pierced', () => {
    const fired = fireTowers([tower(1, 'cannon')], [tank(7)], 0);
    expect(fired.shots[0]!.hits).toEqual([{ enemyId: 7, damage: 60 }]);
  });

  it('ignores armor only up to its pierce', () => {
    const fired = fireTowers([tower(1, 'cannon')], [enemy(7, { armor: 8, hp: 300 })], 0);
    expect(fired.shots[0]!.hits).toEqual([{ enemyId: 7, damage: 57 }]);
  });

  it('kills Infantry in one shot, the overkill wasted', () => {
    const fired = fireTowers([tower(1, 'cannon')], [enemy(7)], 0);
    expect(fired.shots[0]!.hits).toEqual([{ enemyId: 7, damage: ENEMY_STATS.infantry.maxHp }]);
    expect(fired.kills).toHaveLength(1);
  });

  it('never targets air', () => {
    const fired = fireTowers([tower(1, 'cannon')], [enemy(7, { layer: 'air' })], 0);
    expect(fired.shots).toEqual([]);
    expect(fired.enemies).toEqual([enemy(7, { layer: 'air' })]);
  });

  it('with a Rifle Nest, kills a Tank in 4 s, where two Rifle Nests cannot', () => {
    // 4 s is about how long a slow Tank spends in range of a tower beside the Path.
    const killedWithin = (towers: Tower[], ms: number) => {
      let enemies = [tank(7)];
      for (let t = 0; t < ms; t += TICK_MS) {
        const fired = fireTowers(towers, enemies, TICK_MS);
        ({ towers, enemies } = fired);
        if (fired.kills.length > 0) return true;
      }
      return false;
    };
    expect(killedWithin([tower(1, 'cannon'), tower(2, 'rifleNest')], 4000)).toBe(true);
    expect(killedWithin([tower(1, 'rifleNest'), tower(2, 'rifleNest')], 4000)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import { AIM_TOLERANCE, START_HEADING, TOWER_STATS, TURN_RATES } from '../data/towers';
import type { Enemy } from './enemies';
import { createGame, TICK_MS } from './game';
import type { MapData } from './map';
import { fireTowers, type Tower } from './towers';

// Path line through tile centers: right along y = 1.5 from x = 0.5 to 3.5, then down x = 3.5 to y = 4.5.
const SMALL: MapData = {
  id: 'small',
  cols: 6,
  rows: 5,
  waypoints: [
    { col: 0, row: 1 },
    { col: 3, row: 1 },
    { col: 3, row: 4 },
  ],
};

// The tower stands on tile (2, 2), center (2.5, 2.5).
const handTower = (stats: Partial<Tower> = {}): Tower => ({
  ...TOWER_STATS.rifleNest,
  id: 1,
  kind: 'rifleNest',
  tile: { col: 2, row: 2 },
  cooldownMs: 0,
  level: 1,
  spent: 50,
  heading: START_HEADING,
  ...stats,
});

const handEnemy = (id: number, position: Enemy['position'], stats: Partial<Enemy> = {}): Enemy => ({
  ...ENEMY_STATS.infantry,
  id,
  kind: 'infantry',
  hp: ENEMY_STATS.infantry.maxHp,
  distance: 1,
  position,
  ...stats,
});

describe('turning to aim', () => {
  // An enemy due east of the tower's center (2.5, 2.5), 2 tiles away: aim angle 0.
  const east = (id = 1) => handEnemy(id, { x: 4.5, y: 2.5 });
  /** Runs `fireTowers` in `TICK_MS` steps for `ms`, against an enemy that stays put; returns each tick's shot count and the last towers. */
  const run = (towers: Tower[], enemies: Enemy[], ms: number) => {
    const shotsByTick: number[] = [];
    for (let t = 0; t < ms; t += TICK_MS) {
      const fired = fireTowers(towers, enemies, TICK_MS);
      towers = fired.towers;
      shotsByTick.push(fired.shots.length + fired.launches.length);
    }
    return { shotsByTick, towers };
  };

  it('has a turn rate per kind: Rifle Nest and AA Gun fast, Cannon slow, Mortar exempt', () => {
    expect(TURN_RATES.cannon).toBeLessThan(TURN_RATES.rifleNest!);
    expect(TURN_RATES.cannon).toBeLessThan(TURN_RATES.aaGun!);
    expect(TURN_RATES.mortar).toBeNull();
  });

  it('a placed tower faces north', () => {
    const game = createGame({ map: SMALL, lives: 20, money: 100, waves: [] });
    game.placeTower('rifleNest', { col: 2, row: 2 });
    expect(game.state.towers[0]!.heading).toBe(-Math.PI / 2);
  });

  it('a ready tower facing away does not fire, and turns toward its target at its turn rate', () => {
    const tower = handTower({ heading: Math.PI });
    const fired = fireTowers([tower], [east()], 100);
    expect(fired.shots).toEqual([]);
    expect(fired.enemies).toEqual([east()]);
    expect(Math.abs(fired.towers[0]!.heading)).toBeCloseTo(Math.PI - TURN_RATES.rifleNest! * 0.1);
  });

  it('fires on the tick it comes within the aim tolerance, not before', () => {
    // A Cannon facing west turns π to face east.
    const cannon = handTower({ ...TOWER_STATS.cannon, kind: 'cannon', heading: Math.PI });
    const turnMs = ((Math.PI - AIM_TOLERANCE) / TURN_RATES.cannon!) * 1000;
    const { shotsByTick } = run([cannon], [handEnemy(1, { x: 4.5, y: 2.5 }, { hp: 1000 })], 4000);
    const firstShotMs = (shotsByTick.findIndex((n) => n > 0) + 1) * TICK_MS;
    expect(firstShotMs).toBeGreaterThanOrEqual(turnMs);
    expect(firstShotMs).toBeLessThan(turnMs + TICK_MS + 1e-6);
  });

  it('an aligned tower fires at once, as before', () => {
    const fired = fireTowers([handTower({ heading: 0 })], [east()], 0);
    expect(fired.shots.map((s) => s.targetId)).toEqual([1]);
    expect(fired.towers[0]!.heading).toBe(0);
  });

  it('a tower within the tolerance fires, and ends facing its target', () => {
    const fired = fireTowers([handTower({ heading: AIM_TOLERANCE * 0.9 })], [east()], TICK_MS);
    expect(fired.shots).toHaveLength(1);
    expect(fired.towers[0]!.heading).toBeCloseTo(0);
  });

  it('its cooldown keeps running while it turns', () => {
    const tower = handTower({ heading: Math.PI, cooldownMs: 500 });
    const fired = fireTowers([tower], [east()], 100);
    expect(fired.towers[0]!.cooldownMs).toBe(400);
  });

  it('a Mortar fires whatever way it faced, and then faces its target', () => {
    const mortar = handTower({ ...TOWER_STATS.mortar, kind: 'mortar', heading: Math.PI });
    const target = handEnemy(1, { x: 2.5, y: 5 });
    const fired = fireTowers([mortar], [target], 0);
    expect(fired.launches).toHaveLength(1);
    expect(fired.towers[0]!.heading).toBeCloseTo(Math.PI / 2);
  });

  it('a tower with no target keeps its heading', () => {
    const fired = fireTowers([handTower({ heading: 1 })], [], 1000);
    expect(fired.towers[0]!.heading).toBe(1);
  });

  it('a dismantling tower does not turn', () => {
    const fired = fireTowers([handTower({ heading: Math.PI, dismantleMs: 1000 })], [east()], 100);
    expect(fired.towers[0]!.heading).toBe(Math.PI);
  });

  it('an upgrade keeps the heading', () => {
    const game = createGame({ map: SMALL, lives: 20, money: 500, waves: [] });
    const result = game.placeTower('rifleNest', { col: 2, row: 2 });
    if (!result.ok) throw new Error(result.reason);
    game.spawnEnemy('infantry');
    game.tick(500);
    const { heading } = game.state.towers[0]!;
    expect(heading).not.toBe(START_HEADING);
    expect(game.upgradeTower(result.towerId).ok).toBe(true);
    expect(game.state.towers[0]!.heading).toBe(heading);
  });
});

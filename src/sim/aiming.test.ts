import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import {
  AIM_TOLERANCE,
  RETARGET_MARGIN_S,
  START_HEADING,
  TOWER_LEVELS,
  TOWER_STATS,
  TURN_RATES,
  trackHorizon,
} from '../data/towers';
import { coverageIntervals } from './coverage';
import { createPathLine, type Enemy } from './enemies';
import { createGame, TICK_MS } from './game';
import { tileCenter, type MapData } from './map';
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

describe('pre-aiming while idle', () => {
  // A straight Path along y = 0.5, from x = −10 to x = 20. A Cannon on tile (4, 2), center (4.5, 2.5), range 3:
  // the line is 2 tiles off, so the coverage interval is x in 4.5 ± √5, entered at distance 10 + 4.5 − √5.
  const line = createPathLine([
    { x: -10, y: 0.5 },
    { x: 20, y: 0.5 },
  ]);
  const tile = { col: 4, row: 2 };
  const center = tileCenter(tile);
  const coverage = coverageIntervals(line, center, TOWER_STATS.cannon.range);
  const entry = coverage[0]!.entry;
  const entryAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
  const cannon = (stats: Partial<Tower> = {}): Tower =>
    handTower({ ...TOWER_STATS.cannon, kind: 'cannon', tile, coverage, ...stats });
  const at = (id: number, distance: number, stats: Partial<Enemy> = {}): Enemy =>
    handEnemy(id, line.positionAt(distance), { distance, ...stats });
  /** Runs `fireTowers` for `ms` against enemies that stay put; returns the last tower. */
  const settle = (tower: Tower, enemies: Enemy[], ms: number): Tower => {
    let towers = [tower];
    for (let t = 0; t < ms; t += TICK_MS) towers = fireTowers(towers, enemies, TICK_MS).towers;
    return towers[0]!;
  };

  it('looks further ahead for a slower turret: a half turn plus a base', () => {
    expect(trackHorizon('cannon')).toBeGreaterThan(trackHorizon('aaGun')!);
    expect(trackHorizon('aaGun')).toBeGreaterThan(trackHorizon('rifleNest')!);
    expect(trackHorizon('cannon')).toBeCloseTo(3.5);
    expect(trackHorizon('mortar')).toBeNull();
  });

  it('turns toward where the soonest enemy will come into range, not where it is', () => {
    // 1.76 tiles from the entry at 1.5 tiles/s: in range in about 1.2 s.
    const enemy = at(7, 11);
    const tower = settle(cannon(), [enemy], 3000);
    expect(tower.preAimId).toBe(7);
    expect(tower.heading).toBeCloseTo(entryAngle);
    const toEnemy = Math.atan2(enemy.position.y - center.y, enemy.position.x - center.x);
    expect(Math.abs(tower.heading - toEnemy)).toBeGreaterThan(0.2);
  });

  it('turns at its turn rate while pre-aiming, and does not fire', () => {
    const fired = fireTowers([cannon()], [at(7, 11)], 100);
    expect(fired.shots).toEqual([]);
    expect(fired.towers[0]!.heading).toBeCloseTo(START_HEADING - TURN_RATES.cannon! * 0.1);
  });

  it('ignores an enemy too far off to engage within its look-ahead', () => {
    // 12.8 tiles away at 1.5 tiles/s: 8.5 s, past the Cannon's 3.5 s.
    expect(settle(cannon(), [at(7, 0)], 500).preAimId).toBeUndefined();
  });

  it('ignores an enemy with no coverage ahead of it', () => {
    expect(settle(cannon(), [at(7, 25)], 500).preAimId).toBeUndefined();
  });

  it('ignores an enemy on a layer it cannot hit', () => {
    const helicopter = at(7, 11, { kind: 'helicopter', layer: 'air' });
    expect(settle(cannon(), [helicopter], 500).preAimId).toBeUndefined();
  });

  it('with no enemy coming, faces the entry of its first coverage interval', () => {
    const tower = settle(cannon({ heading: 0 }), [], 4000);
    expect(tower.heading).toBeCloseTo(entryAngle);
  });

  it('keeps the enemy it is laying on unless another comes in sooner by more than the margin', () => {
    const laid = cannon({ heading: entryAngle, preAimId: 1 });
    const kept = at(1, 11);
    const gain = (distance: number) => (distance - 11) / ENEMY_STATS.infantry.speed;
    expect(gain(11.2)).toBeLessThan(RETARGET_MARGIN_S);
    expect(fireTowers([laid], [kept, at(2, 11.2)], TICK_MS).towers[0]!.preAimId).toBe(1);
    expect(gain(11.6)).toBeGreaterThan(RETARGET_MARGIN_S);
    expect(fireTowers([laid], [kept, at(2, 11.6)], TICK_MS).towers[0]!.preAimId).toBe(2);
  });

  it('picks the soonest enemy when it has none laid on', () => {
    const fired = fireTowers([cannon({ heading: entryAngle })], [at(1, 11), at(2, 11.1)], TICK_MS);
    expect(fired.towers[0]!.preAimId).toBe(2);
  });

  it('an enemy in range always beats pre-aiming', () => {
    const inRange = at(1, 14.5); // straight above the tower
    const fired = fireTowers([cannon({ heading: entryAngle, preAimId: 2 })], [inRange, at(2, 12.5)], TICK_MS);
    expect(fired.towers[0]!.preAimId).toBeUndefined();
    expect(fired.towers[0]!.heading).toBeLessThan(entryAngle + 0.001 + TURN_RATES.cannon! * (TICK_MS / 1000));
    expect(fired.towers[0]!.heading).toBeGreaterThan(entryAngle);
  });

  it('a Mortar does not pre-aim', () => {
    const mortarCoverage = coverageIntervals(line, center, TOWER_STATS.mortar.range, TOWER_STATS.mortar.minRange);
    const mortar = handTower({ ...TOWER_STATS.mortar, kind: 'mortar', tile, coverage: mortarCoverage, heading: 1 });
    const tower = settle(mortar, [at(7, 7)], 500);
    expect(tower.heading).toBe(1);
    expect(tower.preAimId).toBeUndefined();
  });

  it('the game gives a placed tower its coverage, and recomputes it on an optics upgrade', () => {
    const game = createGame({ map: SMALL, lives: 20, money: 500, waves: [] });
    // From (5.5, 4.5) range 3 reaches part of the downward leg (x = 3.5); range 3.5 reaches more of it.
    const result = game.placeTower('cannon', { col: 5, row: 4 });
    if (!result.ok) throw new Error(result.reason);
    const placed = game.state.towers[0]!.coverage!;
    expect(placed.length).toBeGreaterThan(0);
    expect(game.upgradeTower(result.towerId).ok).toBe(true);
    expect(TOWER_LEVELS.cannon[0].range).toBeGreaterThan(TOWER_STATS.cannon.range);
    const upgraded = game.state.towers[0]!.coverage!;
    const span = (c: typeof placed) => c.reduce((sum, { enter, exit }) => sum + exit - enter, 0);
    expect(span(upgraded)).toBeGreaterThan(span(placed));
  });
});

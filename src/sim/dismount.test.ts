import { describe, expect, it } from 'vitest';
import { DISMOUNT_SPREAD_TILES, ENEMY_DISMOUNT, ENEMY_STATS } from '../data/enemies';
import { dismountDistances } from './enemies';
import { createGame, TICK_MS, type Game, type GameEvents } from './game';
import type { MapData } from './map';
import type { WaveData } from './waves';

// A straight Path along row 1, 20 tiles long, with Rifle Nests along its first tiles on both sides.
const STRAIGHT: MapData = {
  id: 'straight',
  cols: 21,
  rows: 3,
  waypoints: [
    { col: 0, row: 1 },
    { col: 20, row: 1 },
  ],
};
const NEST_COLS = [0, 1, 2, 3];

const ONE_APC: readonly WaveData[] = [{ groups: [{ kind: 'apc', count: 1, spacingMs: 0, delayMs: 0 }] }];

function gameWithNests(): Game {
  const game = createGame({ map: STRAIGHT, lives: 20, money: 1000, waves: ONE_APC });
  for (const col of NEST_COLS) for (const row of [0, 2]) game.placeTower('rifleNest', { col, row });
  return game;
}

/** Ticks until `predicate` holds, failing after a game minute. */
function tickUntil(game: Game, predicate: () => boolean) {
  for (let i = 0; i < 3600 && !predicate(); i++) game.tick(TICK_MS);
  expect(predicate()).toBe(true);
}

function record(game: Game) {
  const log: { killed: GameEvents['enemyKilled'][]; dismounted: GameEvents['dismounted'][]; order: string[] } = {
    killed: [],
    dismounted: [],
    order: [],
  };
  game.events.on('enemyKilled', (e) => {
    log.killed.push(e);
    log.order.push(`killed:${e.enemy.kind}`);
  });
  game.events.on('dismounted', (e) => {
    log.dismounted.push(e);
    log.order.push('dismounted');
  });
  return log;
}

describe('dismountDistances', () => {
  it('centres the squad on the carrier, spread apart along the Path', () => {
    expect(dismountDistances(5, 3, 0.3, 20)).toEqual([4.7, 5, 5.3]);
    expect(dismountDistances(5, 2, 0.4, 20)).toEqual([4.8, 5.2]);
    expect(dismountDistances(5, 1, 0.3, 20)).toEqual([5]);
  });

  it('keeps every soldier on the Path near its ends', () => {
    expect(dismountDistances(0.1, 3, 0.3, 20)).toEqual([0, 0.1, 0.4]);
    expect(dismountDistances(19.9, 3, 0.3, 20)).toEqual([19.6, 19.9, 20]);
  });
});

describe('the APC', () => {
  it('carries a squad of 3 Infantry', () => {
    expect(ENEMY_DISMOUNT.apc).toEqual({ kind: 'infantry', count: 3 });
  });

  it('dismounts 3 full-HP Infantry where it dies, spread out, and reports it after the kill', () => {
    const game = gameWithNests();
    const log = record(game);
    game.callNextWave();
    tickUntil(game, () => log.dismounted.length > 0);

    const apc = log.killed.find((e) => e.enemy.kind === 'apc')!.enemy;
    const [event] = log.dismounted;
    expect(event!.enemy).toEqual(apc);
    expect(event!.spawned).toHaveLength(3);
    expect(log.order.slice(0, 2)).toEqual(['killed:apc', 'dismounted']);

    const expected = dismountDistances(apc.distance, 3, DISMOUNT_SPREAD_TILES, 20);
    expect(event!.spawned.map((e) => e.distance)).toEqual(expected);
    for (const soldier of event!.spawned) {
      expect(soldier).toMatchObject({ kind: 'infantry', hp: 30, maxHp: 30 });
      expect(soldier.position).toEqual({ x: 0.5 + soldier.distance, y: 1.5 });
    }
    expect(new Set([apc.id, ...event!.spawned.map((e) => e.id)]).size).toBe(4);
    expect(game.state.enemies.map((e) => e.id)).toEqual(event!.spawned.map((e) => e.id));
    expect(game.state.phase).toBe('wave');
  });

  it('the squad walks on toward the exit', () => {
    const game = gameWithNests();
    const log = record(game);
    game.callNextWave();
    tickUntil(game, () => log.dismounted.length > 0);
    const before = new Map(log.dismounted[0]!.spawned.map((e) => [e.id, e.distance]));
    game.tick(TICK_MS);
    const walked = game.state.enemies.filter((e) => before.has(e.id));
    expect(walked.length).toBeGreaterThan(0);
    for (const soldier of walked)
      expect(soldier.distance).toBeCloseTo(before.get(soldier.id)! + (ENEMY_STATS.infantry.speed * TICK_MS) / 1000);
  });

  it('an APC that leaks dismounts nothing', () => {
    const game = createGame({ map: STRAIGHT, lives: 20, money: 0, waves: ONE_APC });
    const log = record(game);
    const leaked: GameEvents['enemyLeaked'][] = [];
    game.events.on('enemyLeaked', (e) => leaked.push(e));
    game.callNextWave();
    tickUntil(game, () => game.state.phase !== 'wave');
    expect(leaked.map((e) => e.enemy.kind)).toEqual(['apc']);
    expect(log.dismounted).toEqual([]);
    expect(game.state.lives).toBe(20 - ENEMY_STATS.apc.leakCost);
    expect(game.state.phase).toBe('victory');
  });

  it('pays the APC and each soldier their own reward, and the kill totals add up', () => {
    const game = gameWithNests();
    const log = record(game);
    game.callNextWave();
    const money = game.state.money;
    tickUntil(game, () => game.state.phase === 'victory');
    expect(log.killed.map((e) => e.enemy.kind).sort()).toEqual(['apc', 'infantry', 'infantry', 'infantry']);
    expect(game.state.money - money).toBe(ENEMY_STATS.apc.reward + 3 * ENEMY_STATS.infantry.reward);
    const { stats } = game.state;
    expect(stats.total.kills).toBe(4);
    const towers = Object.values(stats.towers);
    expect(towers.reduce((sum, t) => sum + t.total.kills, 0)).toBe(4);
    expect(towers.reduce((sum, t) => sum + t.total.damage, 0)).toBe(stats.total.damage);
    expect(stats.waves[0]).toMatchObject({ waveNumber: 1, kills: 4 });
  });

  it('dismounts the same way every run (ADR-0002)', () => {
    const run = () => {
      const game = gameWithNests();
      const log = record(game);
      game.callNextWave();
      tickUntil(game, () => game.state.phase === 'victory');
      return { dismounted: log.dismounted, money: game.state.money, timeMs: game.state.timeMs };
    };
    expect(run()).toEqual(run());
  });
});

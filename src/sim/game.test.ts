import { describe, expect, it } from 'vitest';
import { MVP_MAP } from '../data/maps';
import { createGame } from './game';
import type { MapData } from './map';

// Route through tile centers: right 3, then down 3. 6 tiles long; the corner is at 3.
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

describe('createGame', () => {
  it('a new game has the configured Lives, no enemies, and time 0', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    expect(game.state.lives).toBe(20);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.timeMs).toBe(0);
  });

  it('a spawned Infantry starts at the Path start with 30/30 HP and 1.5 tiles/s', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    const id = game.spawnEnemy('infantry');
    expect(game.state.enemies).toEqual([
      { id, kind: 'infantry', hp: 30, maxHp: 30, speed: 1.5, distance: 0, position: { x: 0.5, y: 1.5 } },
    ]);
    expect(game.spawnEnemy('infantry')).not.toBe(id);
  });

  it('an enemy moves speed × dt along the Path each tick', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    game.spawnEnemy('infantry');
    game.tick(1000);
    expect(game.state.timeMs).toBe(1000);
    expect(game.state.enemies[0]).toMatchObject({ distance: 1.5, position: { x: 2, y: 1.5 } });
  });

  it('an enemy crossing a corner mid-tick continues on the next segment without overshoot', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    game.spawnEnemy('infantry');
    game.tick(2500); // 3.75 tiles: the corner at 3, then 0.75 down
    expect(game.state.enemies[0]).toMatchObject({ distance: 3.75, position: { x: 3.5, y: 2.25 } });
  });

  it('one big tick and many small ticks put an enemy in the same place', () => {
    const big = createGame({ map: SMALL, lives: 20 });
    const small = createGame({ map: SMALL, lives: 20 });
    big.spawnEnemy('infantry');
    small.spawnEnemy('infantry');
    big.tick(3000);
    for (let i = 0; i < 180; i++) small.tick(1000 / 60);
    const [a] = big.state.enemies;
    const [b] = small.state.enemies;
    expect(b!.distance).toBeCloseTo(a!.distance, 9);
    expect(b!.position.x).toBeCloseTo(a!.position.x, 9);
    expect(b!.position.y).toBeCloseTo(a!.position.y, 9);
    expect(a!.position).toEqual({ x: 3.5, y: 3 });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('tick rejects dt %s', (dt) => {
    const game = createGame({ map: SMALL, lives: 20 });
    game.spawnEnemy('infantry');
    expect(() => game.tick(dt)).toThrow(RangeError);
    expect(game.state.timeMs).toBe(0);
    expect(game.state.enemies[0]!.distance).toBe(0);
  });
});

describe('leaking', () => {
  const TICK_MS = 1000 / 60;

  it('Infantry leaks on the MVP map after exactly 1160 ticks (29 tiles at 1.5 tiles/s)', () => {
    const game = createGame({ map: MVP_MAP, lives: 20 });
    game.spawnEnemy('infantry');
    for (let i = 0; i < 1159; i++) game.tick(TICK_MS);
    expect(game.state.enemies).toHaveLength(1);
    expect(game.state.enemies[0]!.position.x).toBeCloseTo(15.5, 1);
    game.tick(TICK_MS);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.lives).toBe(19);
  });

  it('a leaking enemy is removed, Lives drop by its leak cost, and enemyLeaked fires once', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    const leaks: unknown[] = [];
    game.events.on('enemyLeaked', (e) => leaks.push(e));
    const id = game.spawnEnemy('infantry');
    game.tick(4000); // exactly the 6-tile route
    game.tick(1000);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.lives).toBe(19);
    expect(leaks).toEqual([
      {
        enemy: { id, kind: 'infantry', hp: 30, maxHp: 30, speed: 1.5, distance: 6, position: { x: 3.5, y: 4.5 } },
        lives: 19,
      },
    ]);
  });

  it('other enemies keep walking when one leaks', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    game.spawnEnemy('infantry');
    game.tick(2000);
    const second = game.spawnEnemy('infantry');
    game.tick(2000);
    expect(game.state.enemies).toEqual([expect.objectContaining({ id: second, distance: 3 })]);
  });

  it('Lives never drop below 0', () => {
    const game = createGame({ map: SMALL, lives: 1 });
    game.spawnEnemy('infantry');
    game.spawnEnemy('infantry');
    game.tick(4000);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.lives).toBe(0);
  });

  it('enemyLeaked listeners see the enemy already removed', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    const seen: number[] = [];
    game.events.on('enemyLeaked', () => seen.push(game.state.enemies.length));
    game.spawnEnemy('infantry');
    game.tick(4000);
    expect(seen).toEqual([0]);
  });

  it('an unsubscribed listener gets no more events', () => {
    const game = createGame({ map: SMALL, lives: 20 });
    let count = 0;
    const off = game.events.on('enemyLeaked', () => count++);
    game.spawnEnemy('infantry');
    game.tick(4000);
    off();
    game.spawnEnemy('infantry');
    game.tick(4000);
    expect(count).toBe(1);
    expect(game.state.lives).toBe(18);
  });
});

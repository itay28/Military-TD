import { describe, expect, it } from 'vitest';
import { MVP_MAP } from '../data/maps';
import { MVP_WAVES } from '../data/waves';
import { createGame, TICK_MS } from './game';
import { InvalidMapError, type MapData } from './map';
import type { WaveData } from './waves';

// Path line through tile centers: right 3, then down 3. 6 tiles long; the turn waypoint is at 3.
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

const INFANTRY = { kind: 'infantry', hp: 30, maxHp: 30, speed: 1.5, reward: 5, leakCost: 1, armor: 0, layer: 'ground' };

// Two short waves: 2 Infantry 1000 ms apart, then 3 Infantry 500 ms apart.
const TWO_WAVES: readonly WaveData[] = [
  { groups: [{ kind: 'infantry', count: 2, spacingMs: 1000, delayMs: 0 }] },
  { groups: [{ kind: 'infantry', count: 3, spacingMs: 500, delayMs: 0 }] },
];

const newGame = (lives = 20, waves = TWO_WAVES) => createGame({ map: SMALL, lives, money: 100, waves });

describe('createGame', () => {
  it('a new game has the configured Lives, no enemies, and time 0', () => {
    const game = newGame();
    expect(game.state.lives).toBe(20);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.timeMs).toBe(0);
  });

  it('a spawned Infantry starts at the Path start with 30/30 HP and 1.5 tiles/s', () => {
    const game = newGame();
    const id = game.spawnEnemy('infantry');
    expect(game.state.enemies).toEqual([{ ...INFANTRY, id, distance: 0, position: { x: 0.5, y: 1.5 } }]);
    expect(game.spawnEnemy('infantry')).not.toBe(id);
  });

  it('an enemy moves speed × dt along the Path each tick', () => {
    const game = newGame();
    game.spawnEnemy('infantry');
    game.tick(1000);
    expect(game.state.timeMs).toBe(1000);
    expect(game.state.enemies[0]).toMatchObject({ distance: 1.5, position: { x: 2, y: 1.5 } });
  });

  it('an enemy passing a waypoint mid-tick continues on the next segment without overshoot', () => {
    const game = newGame();
    game.spawnEnemy('infantry');
    game.tick(2500); // 3.75 tiles: the waypoint at 3, then 0.75 down
    expect(game.state.enemies[0]).toMatchObject({ distance: 3.75, position: { x: 3.5, y: 2.25 } });
  });

  it('one big tick and many small ticks put an enemy in the same place', () => {
    const big = newGame();
    const small = newGame();
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

  it('builds the map from data and exposes it on state', () => {
    const game = createGame({ map: MVP_MAP, lives: 20, money: 100, waves: [] });
    expect(game.state.map.id).toBe('mvp');
    expect(game.state.map.isPath({ col: 0, row: 2 })).toBe(true);
  });

  it('throws InvalidMapError for a malformed map', () => {
    const map = { ...MVP_MAP, waypoints: [{ col: 0, row: 0 }] };
    expect(() => createGame({ map, lives: 20, money: 100, waves: [] })).toThrow(InvalidMapError);
  });

  it('the fixed step is 1/60 s', () => {
    expect(TICK_MS).toBe(1000 / 60);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('tick rejects dt %s', (dt) => {
    const game = newGame();
    game.spawnEnemy('infantry');
    expect(() => game.tick(dt)).toThrow(RangeError);
    expect(game.state.timeMs).toBe(0);
    expect(game.state.enemies[0]!.distance).toBe(0);
  });
});

describe('leaking', () => {
  it('Infantry leaks on the MVP map after exactly 1160 ticks (29 tiles at 1.5 tiles/s)', () => {
    const game = createGame({ map: MVP_MAP, lives: 20, money: 100, waves: [] });
    game.spawnEnemy('infantry');
    for (let i = 0; i < 1159; i++) game.tick(TICK_MS);
    expect(game.state.enemies).toHaveLength(1);
    expect(game.state.enemies[0]!.position.x).toBeCloseTo(15.5, 1);
    game.tick(TICK_MS);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.lives).toBe(19);
  });

  it('a leaking enemy is removed, Lives drop by its leak cost, and enemyLeaked fires once', () => {
    const game = newGame();
    const leaks: unknown[] = [];
    game.events.on('enemyLeaked', (e) => leaks.push(e));
    const id = game.spawnEnemy('infantry');
    game.tick(4000); // exactly the 6-tile Path
    game.tick(1000);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.lives).toBe(19);
    expect(leaks).toEqual([{ enemy: { ...INFANTRY, id, distance: 6, position: { x: 3.5, y: 4.5 } }, lives: 19 }]);
  });

  it('other enemies keep walking when one leaks', () => {
    const game = newGame();
    game.spawnEnemy('infantry');
    game.tick(2000);
    const second = game.spawnEnemy('infantry');
    game.tick(2000);
    expect(game.state.enemies).toEqual([expect.objectContaining({ id: second, distance: 3 })]);
  });

  it('Lives never drop below 0', () => {
    const game = newGame(1);
    game.spawnEnemy('infantry');
    game.spawnEnemy('infantry');
    game.tick(4000);
    expect(game.state.enemies).toEqual([]);
    expect(game.state.lives).toBe(0);
  });

  it('enemyLeaked listeners see the enemy already removed', () => {
    const game = newGame();
    const seen: number[] = [];
    game.events.on('enemyLeaked', () => seen.push(game.state.enemies.length));
    game.spawnEnemy('infantry');
    game.tick(4000);
    expect(seen).toEqual([0]);
  });

  it('an unsubscribed listener gets no more events', () => {
    const game = newGame();
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

describe('waves and phases', () => {
  it('a new game is in the build phase at wave 0 of N', () => {
    const game = newGame();
    expect(game.state).toMatchObject({ phase: 'build', waveNumber: 0, totalWaves: 2 });
  });

  it('starting a wave enters the wave phase, spawns the first enemy at once, and fires waveStarted', () => {
    const game = newGame();
    const started: unknown[] = [];
    game.events.on('waveStarted', (e) => started.push(e));
    expect(game.startWave()).toEqual({ ok: true });
    expect(game.state).toMatchObject({ phase: 'wave', waveNumber: 1 });
    expect(game.state.enemies).toEqual([expect.objectContaining({ kind: 'infantry', distance: 0 })]);
    expect(started).toEqual([{ waveNumber: 1 }]);
  });

  it("a wave's enemies spawn one every spacing ms on fixed ticks", () => {
    const game = newGame();
    game.startWave();
    for (let i = 0; i < 59; i++) game.tick(TICK_MS);
    expect(game.state.enemies).toHaveLength(1);
    game.tick(TICK_MS); // 60 ticks = 1000 ms
    expect(game.state.enemies).toHaveLength(2);
    expect(game.state.enemies[1]!.distance).toBeCloseTo(0, 9);
  });

  it('an enemy spawned mid-tick has already walked the rest of that tick', () => {
    const game = newGame();
    game.startWave();
    game.tick(1500); // the second spawn is due at 1000 and walks 500 ms
    expect(game.state.enemies.map((e) => e.distance)).toEqual([2.25, 0.75]);
  });

  it('startWave fails with notBuildPhase during a wave', () => {
    const game = newGame();
    game.startWave();
    expect(game.startWave()).toEqual({ ok: false, reason: 'notBuildPhase' });
    expect(game.state).toMatchObject({ phase: 'wave', waveNumber: 1 });
    expect(game.state.enemies).toHaveLength(1);
  });

  it("a wave isn't cleared while spawns remain, even with no enemy alive", () => {
    const game = newGame(20, [{ groups: [{ kind: 'infantry', count: 2, spacingMs: 5000, delayMs: 0 }] }]);
    game.startWave();
    game.tick(4500); // the first leaked at 4000; the second is due at 5000
    expect(game.state.enemies).toEqual([]);
    expect(game.state.phase).toBe('wave');
  });

  it('a wave is cleared when all its enemies have spawned and none are alive', () => {
    const game = newGame();
    const cleared: unknown[] = [];
    game.events.on('waveCleared', (e) => cleared.push(e));
    game.startWave();
    game.tick(4999);
    expect(game.state.phase).toBe('wave');
    game.tick(1); // the second enemy leaks at 5000
    expect(game.state).toMatchObject({ phase: 'build', waveNumber: 1, enemies: [] });
    game.tick(1000);
    expect(cleared).toEqual([{ waveNumber: 1 }]);
  });

  it('a tower killing the last enemy of a wave clears it', () => {
    const game = newGame(20, [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }, TWO_WAVES[0]!]);
    const seen: string[] = [];
    game.events.on('enemyKilled', () => seen.push('enemyKilled'));
    game.events.on('waveCleared', () => seen.push('waveCleared'));
    // Tile (1, 2) is next to the Path start: three Rifle Nest shots, 500 ms apart, kill the 30 HP Infantry.
    game.placeTower('rifleNest', { col: 1, row: 2 });
    game.startWave();
    for (let i = 0; i < 120 && game.state.phase === 'wave'; i++) game.tick(TICK_MS);
    expect(seen).toEqual(['enemyKilled', 'waveCleared']);
    expect(game.state).toMatchObject({ phase: 'build', lives: 20, enemies: [] });
  });

  it('the next wave spawns its own count and spacing', () => {
    const game = newGame();
    game.startWave();
    game.tick(5000);
    expect(game.startWave()).toEqual({ ok: true });
    expect(game.state.waveNumber).toBe(2);
    game.tick(2000);
    expect(game.state.enemies.map((e) => e.distance)).toEqual([3, 2.25, 1.5]);
  });

  it('clearing the last wave with Lives left fires waveCleared then victory', () => {
    const game = newGame();
    const seen: unknown[] = [];
    game.events.on('waveCleared', (e) => seen.push(['waveCleared', e]));
    game.events.on('victory', (e) => seen.push(['victory', e]));
    game.startWave();
    game.tick(5000);
    game.startWave();
    game.tick(5000); // the last of 3 spawns at 1000 and leaks at 5000
    expect(game.state).toMatchObject({ phase: 'victory', waveNumber: 2, lives: 15 });
    expect(seen).toEqual([
      ['waveCleared', { waveNumber: 1 }],
      ['waveCleared', { waveNumber: 2 }],
      ['victory', { lives: 15 }],
    ]);
  });

  it('startWave fails with noWavesLeft after victory', () => {
    const game = newGame(20, [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }]);
    game.startWave();
    game.tick(4000);
    expect(game.state.phase).toBe('victory');
    expect(game.startWave()).toEqual({ ok: false, reason: 'noWavesLeft' });
    expect(game.state.waveNumber).toBe(1);
    game.tick(1000);
    expect(game.state.timeMs).toBe(4000);
  });

  it("a game with no waves can't start one", () => {
    const game = newGame(20, []);
    expect(game.state.totalWaves).toBe(0);
    expect(game.startWave()).toEqual({ ok: false, reason: 'noWavesLeft' });
    expect(game.state.phase).toBe('build');
  });

  it('Lives reaching 0 mid-wave fires defeat once and stops the game', () => {
    const game = newGame(1);
    const defeats: unknown[] = [];
    game.events.on('defeat', (e) => defeats.push(e));
    game.startWave();
    game.tick(4000); // the first enemy leaks; the second is 3000 ms in
    expect(game.state).toMatchObject({ phase: 'defeat', lives: 0, timeMs: 4000 });
    expect(defeats).toEqual([{ waveNumber: 1 }]);
    const enemies = game.state.enemies;
    game.tick(1000);
    expect(game.state.timeMs).toBe(4000);
    expect(game.state.enemies).toBe(enemies);
    expect(game.startWave()).toEqual({ ok: false, reason: 'notBuildPhase' });
    expect(defeats).toHaveLength(1);
  });

  it("the last enemy leaking the last Life is a defeat, and the wave isn't cleared", () => {
    const game = newGame(2, [{ groups: [{ kind: 'infantry', count: 2, spacingMs: 1000, delayMs: 0 }] }]);
    const seen: string[] = [];
    game.events.on('waveCleared', () => seen.push('waveCleared'));
    game.events.on('victory', () => seen.push('victory'));
    game.events.on('defeat', () => seen.push('defeat'));
    game.startWave();
    game.tick(5000);
    expect(game.state).toMatchObject({ phase: 'defeat', lives: 0, enemies: [] });
    expect(seen).toEqual(['defeat']);
  });

  it('createGame rejects a malformed wave with RangeError (rules: validateWaves)', () => {
    expect(() => newGame(20, [TWO_WAVES[0]!, { groups: [] }])).toThrow(RangeError);
  });

  it('the MVP wave with no towers: all 8 Infantry leak, 12 Lives left, victory', () => {
    const game = createGame({ map: MVP_MAP, lives: 20, money: 100, waves: MVP_WAVES });
    let leaks = 0;
    game.events.on('enemyLeaked', () => leaks++);
    game.startWave();
    // The last Infantry spawns at 5600 ms (336 ticks) and walks 29 tiles in 1160 ticks.
    for (let i = 0; i < 1495; i++) game.tick(TICK_MS);
    expect(game.state.phase).toBe('wave');
    game.tick(TICK_MS);
    expect(leaks).toBe(8);
    expect(game.state).toMatchObject({ phase: 'victory', lives: 12, waveNumber: 1, totalWaves: 1 });
  });
});

// The End screen's "waves survived".
describe('waves cleared', () => {
  it('a new game has cleared 0 waves', () => {
    expect(newGame().state.wavesCleared).toBe(0);
  });

  it('clearing a wave adds 1', () => {
    const game = newGame();
    game.startWave();
    game.tick(5000); // both Infantry leak by 5000
    expect(game.state).toMatchObject({ phase: 'build', wavesCleared: 1 });
  });

  it('after Victory it is every wave', () => {
    const game = newGame();
    game.startWave();
    game.tick(5000);
    game.startWave();
    game.tick(5000);
    expect(game.state).toMatchObject({ phase: 'victory', wavesCleared: 2, totalWaves: 2 });
  });

  it("after Defeat it doesn't count the wave that was lost", () => {
    const game = newGame(3);
    game.startWave();
    game.tick(5000); // 2 leaks: 1 Life left
    game.startWave();
    game.tick(4000); // the first Infantry of wave 2 leaks
    expect(game.state).toMatchObject({ phase: 'defeat', waveNumber: 2, wavesCleared: 1 });
  });
});

describe('combat stats', () => {
  const run = (game: ReturnType<typeof newGame>, ticks: number) => {
    for (let i = 0; i < ticks; i++) game.tick(TICK_MS);
  };
  const tower = (game: ReturnType<typeof newGame>) => game.placeTower('rifleNest', { col: 2, row: 2 });

  it('records a tower hit and the wave elapsed time', () => {
    const game = newGame();
    const placed = tower(game);
    game.startWave();
    run(game, 600);
    const { stats } = game.state;
    const id = placed.ok ? placed.towerId : -1;
    expect(stats.total.damage).toBeGreaterThan(0);
    expect(stats.towers[id]!.total).toEqual(stats.total);
    expect(stats.wave.elapsedMs).toBeGreaterThan(0);
  });

  it('wave figures freeze once a wave is cleared and reset on the next wave', () => {
    const game = newGame();
    tower(game);
    game.startWave();
    while (game.state.phase === 'wave') game.tick(TICK_MS);
    const frozen = game.state.stats;
    expect(frozen.wave.damage).toBeGreaterThan(0);
    run(game, 120);
    expect(game.state.stats).toEqual(frozen);
    game.startWave();
    expect(game.state.stats.wave).toEqual({ damage: 0, kills: 0, elapsedMs: 0 });
    expect(game.state.stats.total).toEqual(frozen.total);
  });

  it('wave figures freeze on Defeat', () => {
    const game = newGame(1);
    game.startWave();
    while (game.state.phase === 'wave') game.tick(TICK_MS);
    expect(game.state.phase).toBe('defeat');
    const frozen = game.state.stats.wave.elapsedMs;
    game.tick(1000);
    expect(game.state.stats.wave.elapsedMs).toBe(frozen);
  });
});

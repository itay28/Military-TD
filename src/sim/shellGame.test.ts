import { describe, expect, it, vi } from 'vitest';

// The Mortar (#31) isn't in the data yet, so the game under test gets a stand-in shell tower.
vi.mock('../data/towers', () => ({
  TOWER_STATS: {
    rifleNest: { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
    testMortar: {
      cost: 10,
      range: 6,
      fireRate: 0.5,
      damage: 20,
      targets: ['ground'],
      shell: { flightMs: 1000, innerRadius: 0.5, outerRadius: 1.5 },
    },
  },
}));

const { createGame, TICK_MS } = await import('./game');

// Straight path along y = 1.5, x from 0.5 to 9.5. Infantry walks 1.5 tiles/s.
const LINE = {
  id: 'line',
  cols: 10,
  rows: 3,
  waypoints: [
    { col: 0, row: 1 },
    { col: 9, row: 1 },
  ],
};
const ONE_INFANTRY = [{ groups: [{ kind: 'infantry' as const, count: 1, spacingMs: 1000, delayMs: 0 }] }];

function newGame(lives = 20, waves = ONE_INFANTRY) {
  const game = createGame({ map: LINE, lives, money: 100, waves });
  const landed: { position: unknown; hits: readonly { enemyId: number; damage: number }[] }[] = [];
  const fired: unknown[] = [];
  const kills: number[] = [];
  game.events.on('shellLanded', (e) => landed.push(e));
  game.events.on('shellFired', (e) => fired.push(e));
  game.events.on('enemyKilled', (e) => kills.push(e.enemy.id));
  return { game, landed, fired, kills };
}

/** Places the stand-in shell tower (not in `TowerKind`) and returns its id. */
const placeMortar = (game: ReturnType<typeof newGame>['game'], tile: { col: number; row: number }): number =>
  (game.placeTower('testMortar' as never, tile) as { towerId: number }).towerId;

const run = (game: ReturnType<typeof newGame>['game'], ms: number) => {
  for (let t = 0; t < ms; t += TICK_MS) game.tick(TICK_MS);
};

describe('shell towers', () => {
  it('firing adds a shell aimed at the target’s position then, and damages nothing yet', () => {
    const { game, fired } = newGame();
    game.spawnEnemy('infantry');
    const towerId = placeMortar(game, { col: 2, row: 2 });
    game.tick(TICK_MS);
    const target = game.state.enemies[0]!.position;
    expect(game.state.shells).toHaveLength(1);
    expect(game.state.shells[0]).toMatchObject({ towerId, target, landsAtMs: TICK_MS + 1000 });
    expect(game.state.enemies[0]!.hp).toBe(30);
    expect(fired).toEqual([{ shellId: game.state.shells[0]!.id, towerId, from: { x: 2.5, y: 2.5 }, target }]);
  });

  it('the shell lands flightMs after firing at the spot aimed, though the target walked on', () => {
    const { game, landed } = newGame();
    const id = game.spawnEnemy('infantry');
    placeMortar(game, { col: 2, row: 2 });
    game.tick(TICK_MS);
    const aimed = game.state.shells[0]!.target;
    run(game, 950);
    expect(landed).toEqual([]);
    run(game, 100);
    expect(landed).toHaveLength(1);
    expect(landed[0]!.position).toEqual(aimed);
    // Walked 1.5 tiles away: outside the 1.5 outer ring only by a hair of ticks, so it may or may not be hit;
    // what matters is the blast stayed where it was aimed.
    expect(game.state.enemies.find((e) => e.id === id)!.position.x).toBeGreaterThan(aimed.x);
  });

  it('a Jeep-speed enemy escapes the blast; the slower one behind it is hit', () => {
    const { game, landed } = newGame();
    const fast = game.spawnEnemy('infantry');
    placeMortar(game, { col: 2, row: 2 });
    game.tick(TICK_MS);
    // Lead enemy is at the aim point; give it a speed boost by hand-editing state, as no fast kind exists yet.
    (game.state.enemies as unknown as { speed: number }[])[0]!.speed = 6;
    const slow = game.spawnEnemy('infantry');
    run(game, 1000);
    const ids = landed[0]!.hits.map((h) => h.enemyId);
    expect(ids).not.toContain(fast);
    expect(ids).toContain(slow);
  });

  it('a shell’s damage and kill count for its tower in the stats', () => {
    const { game, landed } = newGame();
    const id = game.spawnEnemy('infantry');
    const mortar = placeMortar(game, { col: 2, row: 2 });
    game.tick(TICK_MS);
    (game.state.enemies as unknown as { speed: number; hp: number }[])[0]!.speed = 0;
    (game.state.enemies as unknown as { hp: number }[])[0]!.hp = 5;
    run(game, 1050);
    expect(landed[0]!.hits).toEqual([{ enemyId: id, damage: 5 }]);
    expect(game.state.stats.towers[mortar]!.total).toEqual({ damage: 5, kills: 1 });
    expect(game.state.stats.total).toEqual({ damage: 5, kills: 1 });
  });

  it('a shell kill pays its reward and sends enemyKilled', () => {
    const { game, kills } = newGame();
    const id = game.spawnEnemy('infantry');
    placeMortar(game, { col: 2, row: 2 });
    game.tick(TICK_MS);
    (game.state.enemies as unknown as { speed: number; hp: number }[])[0]!.speed = 0;
    (game.state.enemies as unknown as { hp: number }[])[0]!.hp = 5;
    const money = game.state.money;
    run(game, 1050);
    expect(kills).toEqual([id]);
    expect(game.state.money).toBe(money + 5);
  });

  it('a shell keeps flying after its tower is gone', () => {
    const { game, landed } = newGame();
    game.spawnEnemy('infantry');
    placeMortar(game, { col: 2, row: 2 });
    game.tick(TICK_MS);
    (game.state as unknown as { towers: unknown[] }).towers = [];
    run(game, 1050);
    expect(landed).toHaveLength(1);
    expect(game.state.shells).toEqual([]);
  });

  it('shells don’t hold up waveCleared, and clear on Victory', () => {
    const { game } = newGame();
    const cleared: number[] = [];
    game.events.on('waveCleared', ({ waveNumber }) => cleared.push(waveNumber));
    placeMortar(game, { col: 2, row: 2 });
    game.placeTower('rifleNest', { col: 2, row: 0 });
    game.startWave();
    // The Rifle Nest kills the lone Infantry while the Mortar's shell is still up.
    for (let t = 0; t < 600 && game.state.phase === 'wave'; t++) game.tick(TICK_MS);
    expect(cleared).toEqual([1]);
    expect(game.state.phase).toBe('victory');
    expect(game.state.shells).toEqual([]);
  });

  it('Defeat clears shells in flight', () => {
    const { game } = newGame(1, []);
    placeMortar(game, { col: 8, row: 2 });
    game.spawnEnemy('infantry');
    // Walks 9 tiles at 1.5/s = 6 s; the Mortar keeps firing at it on the way.
    run(game, 7000);
    expect(game.state.phase).toBe('defeat');
    expect(game.state.shells).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { createGame, TICK_MS, type Game } from './game';
import type { MapData } from './map';
import type { WaveData } from './waves';

// Path line through tile centers: right along row 1 from col 0 to 3, then down col 3 to row 4.
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

const ONE_INFANTRY: readonly WaveData[] = [{ kind: 'infantry', count: 1, spacingMs: 0 }];

const newGame = (money = 100, waves: readonly WaveData[] = []) => createGame({ map: SMALL, lives: 20, money, waves });

/** Ticks until the phase leaves 'wave', for at most `maxMs`. */
function runWave(game: Game, maxMs = 10_000) {
  for (let t = 0; t < maxMs && game.state.phase === 'wave'; t += TICK_MS) game.tick(TICK_MS);
}

describe('Money', () => {
  it('a new game starts with the configured Money', () => {
    expect(newGame(100).state.money).toBe(100);
  });

  it('placing a Rifle Nest deducts its 50 cost and returns the tower id', () => {
    const game = newGame(100);
    const result = game.placeTower('rifleNest', { col: 2, row: 2 });
    expect(result).toEqual({ ok: true, towerId: expect.any(Number) });
    expect(game.state.money).toBe(50);
    expect(game.state.towers.map((t) => t.id)).toEqual([result.ok && result.towerId]);
  });

  it('a killed enemy credits its Reward, already counted when enemyKilled fires', () => {
    const game = newGame(100, ONE_INFANTRY);
    const seen: { reward: number; money: number }[] = [];
    game.events.on('enemyKilled', ({ reward }) => seen.push({ reward, money: game.state.money }));
    // Tile (1, 2) is next to the Path start: three shots kill the 30 HP Infantry.
    game.placeTower('rifleNest', { col: 1, row: 2 });
    game.startWave();
    runWave(game);
    expect(seen).toEqual([{ reward: 5, money: 55 }]);
    expect(game.state.money).toBe(55);
  });

  it('a leaked enemy pays no Reward', () => {
    const game = newGame(100, ONE_INFANTRY);
    game.startWave();
    runWave(game);
    expect(game.state).toMatchObject({ lives: 19, money: 100 });
  });
});

describe('placeTower refusals', () => {
  /** Places a tower expecting `reason`, and checks that nothing changed. */
  function expectRefused(game: Game, tile: { col: number; row: number }, reason: string) {
    const before = { money: game.state.money, towers: game.state.towers };
    expect(game.placeTower('rifleNest', tile)).toEqual({ ok: false, reason });
    expect(game.state.money).toBe(before.money);
    expect(game.state.towers).toEqual(before.towers);
  }

  it('a Path tile is notBuildable', () => {
    expectRefused(newGame(), { col: 2, row: 1 }, 'notBuildable');
  });

  it('a tile outside the grid is notBuildable', () => {
    const game = newGame();
    expectRefused(game, { col: 6, row: 0 }, 'notBuildable');
    expectRefused(game, { col: -1, row: 0 }, 'notBuildable');
    expectRefused(game, { col: 0.5, row: 0 }, 'notBuildable');
  });

  it('a tile with a tower on it is occupied', () => {
    const game = newGame();
    game.placeTower('rifleNest', { col: 2, row: 2 });
    expectRefused(game, { col: 2, row: 2 }, 'occupied');
  });

  it('less Money than the cost is insufficientMoney; exactly the cost is enough', () => {
    expectRefused(newGame(49), { col: 2, row: 2 }, 'insufficientMoney');
    const game = newGame(50);
    expect(game.placeTower('rifleNest', { col: 2, row: 2 })).toMatchObject({ ok: true });
    expect(game.state.money).toBe(0);
  });

  it('placement is allowed during a wave', () => {
    const game = newGame(100, [{ kind: 'infantry', count: 3, spacingMs: 1000 }]);
    game.startWave();
    expect(game.state.phase).toBe('wave');
    expect(game.placeTower('rifleNest', { col: 2, row: 2 })).toMatchObject({ ok: true });
  });

  it('placement after Victory is gameEnded', () => {
    const game = newGame(100, ONE_INFANTRY);
    game.placeTower('rifleNest', { col: 1, row: 2 });
    game.startWave();
    runWave(game);
    expect(game.state.phase).toBe('victory');
    expectRefused(game, { col: 4, row: 4 }, 'gameEnded');
  });

  it('placement after Defeat is gameEnded', () => {
    const game = createGame({ map: SMALL, lives: 1, money: 100, waves: ONE_INFANTRY });
    game.startWave();
    runWave(game);
    expect(game.state.phase).toBe('defeat');
    expectRefused(game, { col: 4, row: 4 }, 'gameEnded');
  });
});

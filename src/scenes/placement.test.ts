import { describe, expect, it } from 'vitest';
import { createGame, TICK_MS } from '../sim/game';
import type { MapData } from '../sim/map';
import { ghostAt, placeAt } from './placement';

// Path along row 1 from col 0 to col 3, then down col 3 to row 4.
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

const newGame = (money = 100, lives = 20) =>
  createGame({ map: SMALL, lives, money, waves: [{ kind: 'infantry', count: 1, spacingMs: 0 }] });

const EMPTY = { col: 2, row: 2 };
const PATH = { col: 2, row: 1 };

describe('ghostAt', () => {
  it('shows a placeable ghost on an empty buildable tile with enough Money', () => {
    expect(ghostAt(newGame(), 'rifleNest', EMPTY)).toEqual({ tile: EMPTY, placeable: true });
  });

  it('shows a ghost that is not placeable on a Path tile', () => {
    expect(ghostAt(newGame(), 'rifleNest', PATH)).toEqual({ tile: PATH, placeable: false });
  });

  it('shows a ghost that is not placeable when Money is short', () => {
    expect(ghostAt(newGame(49), 'rifleNest', EMPTY)).toEqual({ tile: EMPTY, placeable: false });
  });

  it('shows a ghost that is not placeable once the game has ended', () => {
    const game = newGame(100, 1);
    game.startWave();
    for (let t = 0; t < 20_000 && game.state.phase === 'wave'; t += TICK_MS) game.tick(TICK_MS);
    expect(game.state.phase).toBe('defeat');
    expect(ghostAt(game, 'rifleNest', EMPTY)).toEqual({ tile: EMPTY, placeable: false });
  });

  it('shows no ghost off the map or with no tile under the pointer', () => {
    expect(ghostAt(newGame(), 'rifleNest', { col: 6, row: 0 })).toBeUndefined();
    expect(ghostAt(newGame(), 'rifleNest', { col: -1, row: 2 })).toBeUndefined();
    expect(ghostAt(newGame(), 'rifleNest', undefined)).toBeUndefined();
  });

  it('shows no ghost over a standing tower, which shows its own range ring instead', () => {
    const game = newGame();
    game.placeTower('rifleNest', EMPTY);
    expect(ghostAt(game, 'rifleNest', EMPTY)).toBeUndefined();
  });
});

describe('placeAt', () => {
  it('places a tower and returns no message', () => {
    const game = newGame();
    expect(placeAt(game, 'rifleNest', EMPTY)).toBeUndefined();
    expect(game.state.towers.map((t) => t.tile)).toEqual([EMPTY]);
  });

  it('places during a wave too', () => {
    const game = newGame();
    game.startWave();
    expect(game.state.phase).toBe('wave');
    expect(ghostAt(game, 'rifleNest', EMPTY)).toEqual({ tile: EMPTY, placeable: true });
    expect(placeAt(game, 'rifleNest', EMPTY)).toBeUndefined();
    expect(game.state.towers).toHaveLength(1);
  });

  it('says why when the sim refuses', () => {
    expect(placeAt(newGame(49), 'rifleNest', EMPTY)).toBe('Not enough money');
    expect(placeAt(newGame(), 'rifleNest', PATH)).toBe("Can't build here");
    const game = newGame();
    placeAt(game, 'rifleNest', EMPTY);
    expect(placeAt(game, 'rifleNest', EMPTY)).toBe('Tile occupied');
  });
});

import { describe, expect, it } from 'vitest';
import { MVP_MAP } from '../data/maps';
import { createGame, TICK_MS } from './game';
import { InvalidMapError } from './map';

describe('createGame', () => {
  it('builds the map from data and exposes it on state', () => {
    const game = createGame({ map: MVP_MAP });
    expect(game.state.map.id).toBe('mvp');
    expect(game.state.map.isPath({ col: 0, row: 2 })).toBe(true);
  });

  it('throws InvalidMapError for a malformed map', () => {
    const map = { ...MVP_MAP, waypoints: [{ col: 0, row: 0 }] };
    expect(() => createGame({ map })).toThrow(InvalidMapError);
  });

  it('starts at time 0 and each tick advances time by dtMs', () => {
    const game = createGame({ map: MVP_MAP });
    expect(game.state.timeMs).toBe(0);
    game.tick(TICK_MS);
    game.tick(TICK_MS);
    expect(game.state.timeMs).toBeCloseTo(2 * TICK_MS);
  });

  it('the fixed step is 1/60 s', () => {
    expect(TICK_MS).toBe(1000 / 60);
  });
});

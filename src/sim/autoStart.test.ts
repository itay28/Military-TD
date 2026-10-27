import { describe, expect, it } from 'vitest';
import { AUTO_START_DELAY_MS } from '../data/waves';
import { createGame, type Game } from './game';
import type { MapData } from './map';

// Path 6 tiles long: an Infantry (1.5 tiles/s) leaks after 4000 ms.
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
const LEAK_MS = 4000;

// One-Infantry waves; nobody shoots, so each wave clears when its Infantry leaks.
const newGame = (waves = 2, lives = 20): Game =>
  createGame({
    map: SMALL,
    money: 100,
    lives,
    waves: Array.from({ length: waves }, () => ({
      groups: [{ kind: 'infantry' as const, count: 1, spacingMs: 100, delayMs: 0 }],
    })),
  });

/** Starts the next wave and lets its one Infantry leak, which clears the wave. */
const playWave = (game: Game) => {
  game.startWave();
  game.tick(LEAK_MS);
};

describe('auto-start waves', () => {
  it('is off in a new game, with no countdown', () => {
    const game = newGame();
    expect(game.state.autoStart).toBe(false);
    expect(game.state.autoStartAtMs).toBeUndefined();
  });

  it('starts the next wave AUTO_START_DELAY_MS after a wave is cleared, not before', () => {
    const game = newGame();
    expect(game.setAutoStart(true)).toEqual({ ok: true });
    playWave(game);
    expect(game.state.phase).toBe('build');
    expect(game.state.autoStartAtMs).toBe(game.state.timeMs + AUTO_START_DELAY_MS);
    game.tick(AUTO_START_DELAY_MS - 1);
    expect(game.state.phase).toBe('build');
    game.tick(1);
    expect(game.state.phase).toBe('wave');
    expect(game.state.waveNumber).toBe(2);
    expect(game.state.autoStartAtMs).toBeUndefined();
  });

  it('emits waveStarted when it starts a wave', () => {
    const game = newGame();
    const started: number[] = [];
    game.events.on('waveStarted', ({ waveNumber }) => started.push(waveNumber));
    game.setAutoStart(true);
    game.tick(AUTO_START_DELAY_MS);
    expect(started).toEqual([1]);
  });

  it('turned on in the Build phase starts the countdown', () => {
    const game = newGame();
    game.tick(1000);
    game.setAutoStart(true);
    expect(game.state.autoStart).toBe(true);
    expect(game.state.autoStartAtMs).toBe(1000 + AUTO_START_DELAY_MS);
    game.tick(AUTO_START_DELAY_MS);
    expect(game.state.waveNumber).toBe(1);
  });

  it('turned on again while counting down keeps the countdown', () => {
    const game = newGame();
    game.setAutoStart(true);
    game.tick(1000);
    game.setAutoStart(true);
    expect(game.state.autoStartAtMs).toBe(AUTO_START_DELAY_MS);
  });

  it('turned off cancels the countdown, and no wave starts', () => {
    const game = newGame();
    game.setAutoStart(true);
    game.tick(1000);
    expect(game.setAutoStart(false)).toEqual({ ok: true });
    expect(game.state.autoStart).toBe(false);
    expect(game.state.autoStartAtMs).toBeUndefined();
    game.tick(AUTO_START_DELAY_MS * 2);
    expect(game.state.phase).toBe('build');
    expect(game.state.waveNumber).toBe(0);
  });

  it('Start Wave during the countdown starts the wave at once and ends the countdown', () => {
    const game = newGame();
    game.setAutoStart(true);
    game.tick(1000);
    expect(game.startWave()).toEqual({ ok: true });
    expect(game.state.waveNumber).toBe(1);
    expect(game.state.autoStartAtMs).toBeUndefined();
  });

  it('turned on during a wave starts no countdown until the wave is cleared', () => {
    const game = newGame();
    game.startWave();
    game.setAutoStart(true);
    expect(game.state.autoStartAtMs).toBeUndefined();
    game.tick(LEAK_MS);
    expect(game.state.phase).toBe('build');
    expect(game.state.autoStartAtMs).toBe(game.state.timeMs + AUTO_START_DELAY_MS);
  });

  it('does nothing after the last wave: Victory, no countdown', () => {
    const game = newGame(1);
    game.setAutoStart(true);
    game.tick(AUTO_START_DELAY_MS);
    game.tick(LEAK_MS);
    expect(game.state.phase).toBe('victory');
    expect(game.state.autoStartAtMs).toBeUndefined();
  });

  it('is refused once the game is over', () => {
    const game = newGame(2, 1);
    playWave(game);
    expect(game.state.phase).toBe('defeat');
    expect(game.setAutoStart(true)).toEqual({ ok: false, reason: 'gameEnded' });
    expect(game.state.autoStart).toBe(false);
    expect(game.state.autoStartAtMs).toBeUndefined();
  });

  it('counts sim time: one big tick or many small ones start the wave at the same time', () => {
    const startAt = (step: number) => {
      const game = newGame();
      game.setAutoStart(true);
      let startedAt: number | undefined;
      game.events.on('waveStarted', () => (startedAt = game.state.timeMs));
      while (startedAt === undefined) game.tick(step);
      return startedAt;
    };
    expect(startAt(AUTO_START_DELAY_MS)).toBe(AUTO_START_DELAY_MS);
    expect(startAt(500)).toBe(AUTO_START_DELAY_MS);
  });
});

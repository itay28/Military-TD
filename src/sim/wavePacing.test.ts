import { describe, expect, it } from 'vitest';
import { DEFAULT_WAVE_AFTER_MS } from '../data/waves';
import { createGame, type Game } from './game';
import type { MapData } from './map';
import type { WaveData } from './waves';

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

const infantry = (count: number, afterMs?: number): WaveData => ({
  groups: [{ kind: 'infantry', count, spacingMs: 100, delayMs: 0 }],
  ...(afterMs === undefined ? {} : { afterMs }),
});

// Nobody shoots, so each wave clears when its Infantry leak.
const newGame = (waves: readonly WaveData[], tacticalMode?: boolean, lives = 20): Game =>
  createGame({ map: SMALL, money: 100, lives, waves, ...(tacticalMode === undefined ? {} : { tacticalMode }) });

describe('wave timers (the default, timed mode)', () => {
  it('is timed by default: the first wave is due after its build window', () => {
    const game = newGame([infantry(1, 10_000), infantry(1, 8000)]);
    expect(game.state.tacticalMode).toBe(false);
    expect(game.state.nextWaveAtMs).toBe(10_000);
    game.tick(9999);
    expect(game.state.phase).toBe('build');
    game.tick(1);
    expect(game.state.phase).toBe('wave');
    expect(game.state.waveNumber).toBe(1);
    expect(game.state.activeWaves).toEqual([1]);
  });

  it('a wave without afterMs is due DEFAULT_WAVE_AFTER_MS after the one before', () => {
    const game = newGame([infantry(1), infantry(1)]);
    expect(game.state.nextWaveAtMs).toBe(DEFAULT_WAVE_AFTER_MS);
  });

  it('the next wave is due afterMs from the previous wave start, and arrives on time with enemies still alive', () => {
    // Wave 1: 30 Infantry 100 ms apart, the last leaks at 2900 + 4000 ms; wave 2 is due 2000 ms after wave 1.
    const game = newGame([infantry(30, 0), infantry(1, 2000)]);
    game.tick(0);
    expect(game.state.waveNumber).toBe(1);
    expect(game.state.nextWaveAtMs).toBe(2000);
    game.tick(2000);
    expect(game.state.waveNumber).toBe(2);
    expect(game.state.activeWaves).toEqual([1, 2]);
    expect(game.state.enemies.length).toBeGreaterThan(1);
  });

  it('overlapping waves are cleared each on its own, with their own figures in the stats', () => {
    const game = newGame([infantry(30, 0), infantry(1, 2000)]);
    const cleared: number[] = [];
    game.events.on('waveCleared', ({ waveNumber }) => cleared.push(waveNumber));
    game.tick(0);
    game.tick(2000);
    // Wave 2's one Infantry leaks at 6000 ms, wave 1's last at 6900 ms.
    game.tick(4000);
    expect(cleared).toEqual([2]);
    expect(game.state.activeWaves).toEqual([1]);
    expect(game.state.wavesCleared).toBe(1);
    game.tick(1000);
    expect(cleared).toEqual([2, 1]);
    expect(game.state.stats.waves.map((w) => [w.waveNumber, w.elapsedMs])).toEqual([
      [2, 4000],
      [1, 7000],
    ]);
  });

  it('Victory only when every wave has spawned and the field is clear', () => {
    const game = newGame([infantry(30, 0), infantry(1, 2000)]);
    game.tick(0);
    game.tick(2000);
    game.tick(4000); // wave 2, the last, is cleared while wave 1 still runs
    expect(game.state.phase).toBe('wave');
    game.tick(1000);
    expect(game.state.phase).toBe('victory');
    expect(game.state.wavesCleared).toBe(2);
  });

  it('a hit counts for the hit enemy`s wave', () => {
    const game = createGame({
      map: SMALL,
      money: 1000,
      lives: 20,
      waves: [infantry(1, 0), infantry(1, 1000)],
    });
    game.placeTower('rifleNest', { col: 2, row: 2 });
    const victory = { done: false };
    game.events.on('victory', () => (victory.done = true));
    for (let i = 0; i < 1000 && !victory.done; i++) game.tick(1000 / 60);
    const { waves, total } = game.state.stats;
    expect(waves.reduce((sum, w) => sum + w.damage, 0)).toBe(total.damage);
    expect(waves.every((w) => w.kills <= 1)).toBe(true);
  });

  it('after the last wave starts, nothing is due', () => {
    const game = newGame([infantry(1, 0), infantry(1, 1000)]);
    game.tick(0);
    game.tick(1000);
    expect(game.state.waveNumber).toBe(2);
    expect(game.state.nextWaveAtMs).toBeUndefined();
  });
});

describe('callNextWave', () => {
  it('starts the next wave now, during another wave too, and restarts the timer from that moment', () => {
    const game = newGame([infantry(30, 0), infantry(1, 20_000), infantry(1, 15_000)]);
    game.tick(0);
    game.tick(500);
    expect(game.callNextWave()).toEqual({ ok: true });
    expect(game.state.waveNumber).toBe(2);
    expect(game.state.activeWaves).toEqual([1, 2]);
    expect(game.state.nextWaveAtMs).toBe(500 + 15_000);
  });

  it('pays no bonus', () => {
    const game = newGame([infantry(1, 30_000)]);
    game.callNextWave();
    expect(game.state.money).toBe(100);
  });

  it('refuses once every wave has started, and after the game ends', () => {
    const game = newGame([infantry(1, 0)], false, 1);
    game.tick(0);
    expect(game.callNextWave()).toEqual({ ok: false, reason: 'noWavesLeft' });
    const two = newGame([infantry(1, 0), infantry(1, 60_000)], false, 1);
    two.tick(0);
    two.tick(LEAK_MS);
    expect(two.state.phase).toBe('defeat');
    expect(two.callNextWave()).toEqual({ ok: false, reason: 'gameEnded' });
  });

  it('emits waveStarted', () => {
    const game = newGame([infantry(1, 30_000)]);
    const started: number[] = [];
    game.events.on('waveStarted', ({ waveNumber }) => started.push(waveNumber));
    game.callNextWave();
    expect(started).toEqual([1]);
  });
});

describe('Tactical mode', () => {
  it('never starts a wave by itself', () => {
    const game = newGame([infantry(1, 0), infantry(1, 0)], true);
    expect(game.state.tacticalMode).toBe(true);
    expect(game.state.nextWaveAtMs).toBeUndefined();
    game.tick(10 * 60_000);
    expect(game.state.phase).toBe('build');
    expect(game.state.waveNumber).toBe(0);
  });

  it('starts a wave only when called, one at a time', () => {
    const game = newGame([infantry(30, 0), infantry(1, 0)], true);
    expect(game.callNextWave()).toEqual({ ok: true });
    game.tick(1000);
    expect(game.callNextWave()).toEqual({ ok: false, reason: 'notBuildPhase' });
    game.tick(10_000);
    expect(game.state.phase).toBe('build');
    expect(game.state.nextWaveAtMs).toBeUndefined();
    game.tick(60_000);
    expect(game.state.waveNumber).toBe(1);
    expect(game.callNextWave()).toEqual({ ok: true });
  });
});

describe('Defeat with waves overlapping', () => {
  it('ends every active wave, and counts only the cleared ones', () => {
    // Wave 1's Infantry leak from 4000 ms on and take the 3 Lives while wave 2 is still on the field.
    const game = newGame([infantry(10, 0), infantry(1, 1000), infantry(1, 60_000)], false, 3);
    game.tick(0);
    game.tick(1000);
    for (let i = 0; i < 100 && game.state.phase !== 'defeat'; i++) game.tick(100);
    expect(game.state.phase).toBe('defeat');
    expect(game.state.activeWaves).toEqual([]);
    expect(game.state.nextWaveAtMs).toBeUndefined();
    expect(game.state.stats.waves.map((w) => w.waveNumber).sort()).toEqual([1, 2]);
  });
});

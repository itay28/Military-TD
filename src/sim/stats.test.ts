import { describe, expect, it } from 'vitest';
import {
  addTower,
  addWaveTime,
  emptyStats,
  endWave,
  markSold,
  recordShots,
  resetWave,
  waveDps,
  withWaveElapsed,
} from './stats';
import type { Shot } from './towers';

const shot = (towerId: number, ...hits: [enemyId: number, damage: number][]): Shot => ({
  towerId,
  targetId: hits[0]![0],
  position: { x: 0, y: 0 },
  hits: hits.map(([enemyId, damage]) => ({ enemyId, damage })),
});

describe('recordShots', () => {
  it('a hit adds its damage to its tower and overall, wave and total', () => {
    const stats = recordShots(emptyStats(), [shot(1, [10, 7])], new Set());
    expect(stats.total).toEqual({ damage: 7, kills: 0 });
    expect(stats.wave).toMatchObject({ damage: 7, kills: 0 });
    expect(stats.towers[1]).toEqual({ total: { damage: 7, kills: 0 }, wave: { damage: 7, kills: 0 } });
  });

  it('splash adds every hit', () => {
    const stats = recordShots(emptyStats(), [shot(1, [10, 5], [11, 4], [12, 3])], new Set());
    expect(stats.total.damage).toBe(12);
    expect(stats.towers[1]!.total.damage).toBe(12);
  });

  it('counts only the damage a hit reports, so overkill and armor are already out', () => {
    const stats = recordShots(emptyStats(), [shot(1, [10, 3])], new Set());
    expect(stats.total.damage).toBe(3);
  });

  it('a kill counts for the killing tower only', () => {
    const stats = recordShots(emptyStats(), [shot(1, [10, 5]), shot(2, [10, 2])], new Set([10]));
    expect(stats.towers[2]!.total.kills).toBe(1);
    expect(stats.towers[1]!.total.kills).toBe(0);
    expect(stats.total.kills).toBe(1);
  });
});

describe('totals', () => {
  it('per-tower damage and kills add up to the overall figures', () => {
    const stats = [
      [shot(1, [10, 5], [11, 4]), shot(2, [10, 2])],
      [shot(2, [12, 6]), shot(3, [11, 1], [13, 3])],
    ].reduce((acc, shots) => recordShots(acc, shots, new Set([10, 11])), emptyStats());
    const sum = (key: 'damage' | 'kills') => Object.values(stats.towers).reduce((acc, t) => acc + t.total[key], 0);
    expect(stats.total.damage).toBeGreaterThan(0);
    expect(sum('damage')).toBe(stats.total.damage);
    expect(sum('kills')).toBe(stats.total.kills);
  });
});

describe('waves', () => {
  const played = recordShots(emptyStats(), [shot(1, [10, 7])], new Set([10]));

  it('resetWave clears wave figures but not totals', () => {
    const stats = resetWave(withWaveElapsed(played, 4000));
    expect(stats.wave).toEqual({ damage: 0, kills: 0, elapsedMs: 0 });
    expect(stats.towers[1]!.wave).toEqual({ damage: 0, kills: 0 });
    expect(stats.total).toEqual({ damage: 7, kills: 1 });
    expect(stats.towers[1]!.total).toEqual({ damage: 7, kills: 1 });
  });

  it('keeps a tower entry with no further shots, as a sold tower does', () => {
    const next = recordShots(resetWave(played), [shot(2, [11, 4])], new Set());
    expect(next.towers[1]!.total).toEqual({ damage: 7, kills: 1 });
    expect(next.total.damage).toBe(11);
  });
});

describe('placed towers', () => {
  const placed = addTower(addTower(emptyStats(), 1, 'rifleNest', { col: 1, row: 2 }), 2, 'cannon', { col: 3, row: 0 });

  it('lists every placed tower with its kind and tile, not sold, with no wave time yet', () => {
    expect(placed.placed[1]).toEqual({ kind: 'rifleNest', tile: { col: 1, row: 2 }, waveMs: 0, sold: false });
    expect(placed.placed[2]).toMatchObject({ kind: 'cannon', sold: false });
  });

  it('a sold tower stays listed, marked sold', () => {
    const stats = markSold(placed, 1);
    expect(stats.placed[1]).toEqual({ kind: 'rifleNest', tile: { col: 1, row: 2 }, waveMs: 0, sold: true });
    expect(stats.placed[2]!.sold).toBe(false);
  });

  it('wave time adds only to the towers given', () => {
    const stats = addWaveTime(addWaveTime(placed, [1, 2], 500), [2], 250);
    expect(stats.placed[1]!.waveMs).toBe(500);
    expect(stats.placed[2]!.waveMs).toBe(750);
  });
});

describe('endWave', () => {
  const firstWave = withWaveElapsed(
    recordShots(emptyStats(), [shot(1, [10, 7]), shot(2, [11, 3])], new Set([10])),
    4000,
  );

  it('appends the wave’s totals, duration and per-tower figures', () => {
    const stats = endWave(firstWave, 1);
    expect(stats.waves).toEqual([
      {
        waveNumber: 1,
        damage: 10,
        kills: 1,
        elapsedMs: 4000,
        towers: { 1: { damage: 7, kills: 1 }, 2: { damage: 3, kills: 0 } },
      },
    ]);
  });

  it('keeps earlier waves, and a tower idle in a wave shows 0 for it', () => {
    const second = withWaveElapsed(recordShots(resetWave(endWave(firstWave, 1)), [shot(2, [12, 5])], new Set()), 2000);
    const stats = endWave(second, 2);
    expect(stats.waves.map((w) => w.waveNumber)).toEqual([1, 2]);
    expect(stats.waves[1]).toEqual({
      waveNumber: 2,
      damage: 5,
      kills: 0,
      elapsedMs: 2000,
      towers: { 1: { damage: 0, kills: 0 }, 2: { damage: 5, kills: 0 } },
    });
  });
});

describe('waveDps', () => {
  it('is damage per second', () => expect(waveDps(30, 3000)).toBe(10));
  it('floors elapsed time at 1 s', () => expect(waveDps(8, 100)).toBe(8));
});

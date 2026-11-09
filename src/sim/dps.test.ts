import { describe, expect, it } from 'vitest';
import { dpsBreakdown, meterElapsedMs } from './dps';
import {
  addTower,
  addWaveTime,
  emptyStats,
  endWave,
  markSold,
  recordShots,
  startWaveStats,
  withWaveElapsed,
} from './stats';
import type { Shot } from './towers';

const shot = (towerId: number, enemyId: number, damage: number): Shot => ({
  towerId,
  targetId: enemyId,
  position: { x: 0, y: 0 },
  hits: [{ enemyId, damage }],
});

const tile = { col: 0, row: 0 };

// Wave 1 (4 s): Rifle Nest 1 deals 40 and kills, Cannon 2 deals 60, Rifle Nest 3 deals 20.
// Rifle Nest 1 is sold. Wave 2 (2 s): Cannon 2 deals 30 and kills, Rifle Nest 3 deals 10.
function wave1() {
  let stats = addTower(addTower(addTower(emptyStats(), 1, 'rifleNest', tile), 2, 'cannon', tile), 3, 'rifleNest', tile);
  stats = recordShots(
    startWaveStats(stats, 1),
    [shot(1, 10, 40), shot(2, 11, 60), shot(3, 12, 20)],
    new Set([10]),
    () => 1,
  );
  return endWave(withWaveElapsed(addWaveTime(stats, [1, 2, 3], 4000), new Map([[1, 4000]]), 1), 1);
}
function wave2() {
  let stats = markSold(startWaveStats(wave1(), 2), 1);
  stats = recordShots(stats, [shot(2, 13, 30), shot(3, 14, 10)], new Set([13]), () => 2);
  return endWave(withWaveElapsed(addWaveTime(stats, [2, 3], 2000), new Map([[2, 2000]]), 2), 2);
}
const standing = [
  { id: 2, level: 2 },
  { id: 3, level: 1 },
];

describe('dpsBreakdown', () => {
  it('lists each kind with its DPS, kills and share of the damage', () => {
    const breakdown = dpsBreakdown(wave1(), [{ id: 1, level: 1 }, ...standing], 4000);
    expect(breakdown.kinds.map(({ kind, dps, damage, kills, share }) => ({ kind, dps, damage, kills, share }))).toEqual(
      [
        { kind: 'rifleNest', dps: 15, damage: 60, kills: 1, share: 0.5 },
        { kind: 'cannon', dps: 15, damage: 60, kills: 0, share: 0.5 },
      ],
    );
    expect(breakdown).toMatchObject({ dps: 30, damage: 120, kills: 1 });
  });

  it('breaks ties in the build order and lists each kind’s towers by DPS', () => {
    const breakdown = dpsBreakdown(wave1(), [{ id: 1, level: 1 }, ...standing], 4000);
    // Rifle Nest and Cannon tie at 15 DPS; the build bar lists Rifle Nest first.
    expect(breakdown.kinds.map((k) => k.kind)).toEqual(['rifleNest', 'cannon']);
    const rifles = breakdown.kinds.find((k) => k.kind === 'rifleNest')!;
    expect(rifles.towers).toEqual([
      { towerId: 1, level: 1, dps: 10, damage: 40, kills: 1, sold: false },
      { towerId: 3, level: 1, dps: 5, damage: 20, kills: 0, sold: false },
    ]);
  });

  it('uses the wave figures by default, and leaves out a sold tower that dealt nothing this wave', () => {
    const breakdown = dpsBreakdown(wave2(), standing, 2000);
    expect(breakdown.kinds).toEqual([
      {
        kind: 'cannon',
        dps: 15,
        damage: 30,
        kills: 1,
        share: 0.75,
        towers: [{ towerId: 2, level: 2, dps: 15, damage: 30, kills: 1, sold: false }],
      },
      {
        kind: 'rifleNest',
        dps: 5,
        damage: 10,
        kills: 0,
        share: 0.25,
        towers: [{ towerId: 3, level: 1, dps: 5, damage: 10, kills: 0, sold: false }],
      },
    ]);
  });

  it('uses the totals for the whole game, keeping a sold tower’s damage, marked sold', () => {
    const breakdown = dpsBreakdown(wave2(), standing, 6000, 'total');
    expect(breakdown).toMatchObject({ damage: 160, kills: 2 });
    const rifles = breakdown.kinds.find((k) => k.kind === 'rifleNest')!;
    expect(rifles).toMatchObject({ damage: 70, kills: 1, share: 70 / 160, dps: 70 / 6 });
    expect(rifles.towers).toEqual([
      { towerId: 1, level: undefined, dps: 40 / 6, damage: 40, kills: 1, sold: true },
      { towerId: 3, level: 1, dps: 30 / 6, damage: 30, kills: 0, sold: false },
    ]);
  });

  it('marks a tower no longer standing as sold, before it finishes dismantling in the stats', () => {
    const rifles = dpsBreakdown(wave1(), standing, 4000).kinds.find((k) => k.kind === 'rifleNest')!;
    expect(rifles.towers[0]).toMatchObject({ towerId: 1, sold: true, level: undefined });
  });

  it('floors the time at 1 s, like the HUD', () => {
    expect(dpsBreakdown(wave1(), standing, 200).dps).toBe(120);
  });

  it('lists a placed kind that dealt nothing yet, with no share', () => {
    const stats = addTower(emptyStats(), 1, 'mortar', tile);
    expect(dpsBreakdown(stats, [{ id: 1, level: 1 }], 0)).toEqual({
      dps: 0,
      damage: 0,
      kills: 0,
      kinds: [
        {
          kind: 'mortar',
          dps: 0,
          damage: 0,
          kills: 0,
          share: 0,
          towers: [{ towerId: 1, level: 1, dps: 0, damage: 0, kills: 0, sold: false }],
        },
      ],
    });
  });

  it('is empty before any tower is placed', () => {
    expect(dpsBreakdown(emptyStats(), [], 0)).toEqual({ dps: 0, damage: 0, kills: 0, kinds: [] });
  });
});

describe('meterElapsedMs', () => {
  it('is the current (or last) wave’s time for the wave scope', () => {
    expect(meterElapsedMs(wave2(), 'wave')).toBe(2000);
  });

  it('is every finished wave’s time for the whole game between waves', () => {
    expect(meterElapsedMs(wave2(), 'total')).toBe(6000);
  });

  it('adds the running wave’s time during a wave', () => {
    const running = withWaveElapsed(addWaveTime(startWaveStats(wave1(), 2), [], 1500), new Map([[2, 1500]]), 2);
    expect(meterElapsedMs(running, 'total')).toBe(5500);
  });
});

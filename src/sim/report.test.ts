import { describe, expect, it } from 'vitest';
import { damageReport } from './report';
import { addTower, addWaveTime, emptyStats, endWave, markSold, recordShots, resetWave, withWaveElapsed } from './stats';
import type { Shot } from './towers';

const shot = (towerId: number, enemyId: number, damage: number): Shot => ({
  towerId,
  targetId: enemyId,
  position: { x: 0, y: 0 },
  hits: [{ enemyId, damage }],
});

// Three towers: Rifle Nests 1 and 3 and Cannon 2. Wave 1 (4 s): 1 and 2 stand, 1 deals 40 and kills, 2 deals 60.
// Rifle Nest 1 is sold, Rifle Nest 3 placed. Wave 2 (2 s): 2 and 3 stand, 3 deals 10, 2 deals 0.
function played() {
  let stats = addTower(addTower(emptyStats(), 1, 'rifleNest', { col: 1, row: 2 }), 2, 'cannon', { col: 4, row: 0 });
  stats = recordShots(stats, [shot(1, 10, 40), shot(2, 11, 60)], new Set([10]));
  stats = endWave(withWaveElapsed(addWaveTime(stats, [1, 2], 4000), 4000), 1);
  stats = addTower(markSold(resetWave(stats), 1), 3, 'rifleNest', { col: 2, row: 3 });
  stats = recordShots(stats, [shot(3, 12, 10)], new Set());
  return endWave(withWaveElapsed(addWaveTime(stats, [2, 3], 2000), 2000), 2);
}

describe('damageReport', () => {
  const report = damageReport(played());

  it('lists every tower in placement order with kind, tile, sold, damage, kills and DPS over its own wave time', () => {
    expect(report.towers).toEqual([
      { towerId: 1, kind: 'rifleNest', tile: { col: 1, row: 2 }, sold: true, damage: 40, kills: 1, dps: 10 },
      { towerId: 2, kind: 'cannon', tile: { col: 4, row: 0 }, sold: false, damage: 60, kills: 0, dps: 10 },
      { towerId: 3, kind: 'rifleNest', tile: { col: 2, row: 3 }, sold: false, damage: 10, kills: 0, dps: 5 },
    ]);
  });

  it('sums each placed kind, in the build order, with DPS over the whole game’s wave time', () => {
    expect(report.kinds).toEqual([
      { kind: 'rifleNest', towers: 2, damage: 50, kills: 1, dps: 50 / 6 },
      { kind: 'cannon', towers: 1, damage: 60, kills: 0, dps: 10 },
    ]);
  });

  it('has a row per finished wave with DPS over the wave’s duration', () => {
    expect(report.waves).toEqual([
      { waveNumber: 1, elapsedMs: 4000, damage: 100, kills: 1, dps: 25 },
      { waveNumber: 2, elapsedMs: 2000, damage: 10, kills: 0, dps: 5 },
    ]);
  });

  it('totals the game, with DPS over the whole game’s wave time', () => {
    expect(report.total).toEqual({ elapsedMs: 6000, damage: 110, kills: 1, dps: 110 / 6 });
  });

  it('a tower that never fired or stood in a wave shows zeros, not NaN', () => {
    const { towers, total } = damageReport(addTower(emptyStats(), 1, 'mortar', { col: 0, row: 0 }));
    expect(towers).toEqual([
      { towerId: 1, kind: 'mortar', tile: { col: 0, row: 0 }, sold: false, damage: 0, kills: 0, dps: 0 },
    ]);
    expect(total).toEqual({ elapsedMs: 0, damage: 0, kills: 0, dps: 0 });
  });
});

import { damageReport } from '../../src/sim/report';
import { defineScenario } from './define';

// A Rifle Nest and a Mortar share wave 1; the Rifle Nest is sold before wave 2 starts, so wave 2 is the Mortar's alone.
export default defineScenario({
  description:
    'Two waves, a Rifle Nest sold between them: the damage report’s per-wave rows add up to the game totals, and so do its per-tower rows.',
  towers: [
    { kind: 'rifleNest', tile: { col: 1, row: 3 } },
    { kind: 'mortar', tile: { col: 4, row: 4 } },
  ],
  waves: [
    { groups: [{ kind: 'infantry', count: 4, spacingMs: 800, delayMs: 0 }] },
    { groups: [{ kind: 'infantry', count: 3, spacingMs: 800, delayMs: 0 }] },
  ],
  script: [
    { atTick: 0, command: { type: 'startWave' } },
    { atTick: 2400, command: { type: 'sellTower', towerId: 1 } },
    { atTick: 2700, command: { type: 'startWave' } },
  ],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    expect(events.some((e) => e.type === 'towerSold' && e.towerId === 1)).toBe(true);
    const report = damageReport(finalState.stats);
    expect(report.waves).toHaveLength(2);
    const sum = (rows: readonly { damage: number; kills: number }[], key: 'damage' | 'kills') =>
      rows.reduce((acc, row) => acc + row[key], 0);
    expect(report.total.damage).toBeGreaterThan(0);
    for (const key of ['damage', 'kills'] as const) {
      expect(sum(report.waves, key)).toBe(report.total[key]);
      expect(sum(report.towers, key)).toBe(report.total[key]);
      expect(sum(report.kinds, key)).toBe(report.total[key]);
    }
    // The sold Rifle Nest keeps its row and its wave-1 damage; the Mortar dealt all of wave 2's.
    const [rifle, mortar] = report.towers;
    expect(rifle).toMatchObject({ kind: 'rifleNest', sold: true });
    expect(rifle!.damage).toBeGreaterThan(0);
    expect(mortar).toMatchObject({ kind: 'mortar', sold: false });
    expect(finalState.stats.waves[1]!.towers[1] ?? { damage: 0 }).toMatchObject({ damage: 0 });
  },
});

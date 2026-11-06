import { defineScenario } from './define';

// The DPS meter's e2e spec (#243) opens it after a wave fought by two kinds.
export default defineScenario({
  description: 'A Rifle Nest and a Cannon beside the Path both hit the first of two Infantry waves.',
  towers: [
    { kind: 'rifleNest', tile: { col: 1, row: 3 } },
    { kind: 'cannon', tile: { col: 5, row: 4 } },
  ],
  waves: [
    { groups: [{ kind: 'infantry', count: 6, spacingMs: 600, delayMs: 0 }] },
    { groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] },
  ],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: { event: 'waveCleared' },
  expectations({ finalState }, expect) {
    expect(finalState.waveNumber).toBe(1);
    const { towers } = finalState.stats;
    for (const t of finalState.towers) expect(towers[t.id]!.wave.damage).toBeGreaterThan(0);
  },
});

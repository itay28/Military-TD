import { START_LIVES } from '../../src/data/start';
import { runScenario } from '../../src/sim/scenario';
import type { WaveData } from '../../src/sim/waves';
import { defineScenario } from './define';

// ADR-0011: a wave comes on its timer whether or not the last one is cleared. One Rifle Nest stops a wave of 3
// Infantry, but wave 2's timer brings 3 more while wave 1 is still on the Path.
const infantry = (afterMs: number): WaveData => ({
  afterMs,
  groups: [{ kind: 'infantry', count: 3, spacingMs: 800, delayMs: 0 }],
});
const towers = [{ kind: 'rifleNest', tile: { col: 1, row: 3 } }] as const;
const waves = [infantry(0), infantry(2000)];

export default defineScenario({
  description: 'Wave 2 arrives on its timer while wave 1 is still on the field, and swamps one Rifle Nest.',
  towers,
  waves,
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    // Both waves were on the field together: wave 2 started before wave 1 was cleared.
    const started2 = events.findIndex((e) => e.type === 'waveStarted' && e.waveNumber === 2);
    const cleared1 = events.findIndex((e) => e.type === 'waveCleared' && e.waveNumber === 1);
    expect(started2).toBeGreaterThan(-1);
    expect(started2).toBeLessThan(cleared1);
    const leaked = events.filter((e) => e.type === 'enemyLeaked');
    expect(leaked.length).toBeGreaterThan(0);
    expect(outcome).toBe('victory');
    expect(finalState.lives).toBe(START_LIVES - leaked.length);

    // The same nest holds the same waves when they come one at a time (Tactical mode, called on a clear field).
    const apart = runScenario({ towers, waves, tacticalMode: true, autoStartWaves: true, until: 'end' });
    expect(apart.outcome).toBe('victory');
    expect(apart.finalState.lives).toBe(START_LIVES);
  },
});

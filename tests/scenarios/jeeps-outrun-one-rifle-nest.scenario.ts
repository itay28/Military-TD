import { START_LIVES } from '../../src/data/start';
import { defineScenario } from './define';

// Infantry take ~20 s to cross the MVP Path, so wave 2 starts well after wave 1 is over.
const JEEP_WAVE_TICK = 1800;

export default defineScenario({
  description: 'A burst of Jeeps leaks past one Rifle Nest that stops the same number of Infantry.',
  towers: [{ kind: 'rifleNest', tile: { col: 1, row: 3 } }],
  waves: [
    { kind: 'infantry', count: 3, spacingMs: 300 },
    { kind: 'jeep', count: 3, spacingMs: 300 },
  ],
  script: [
    { atTick: 0, command: { type: 'startWave' } },
    { atTick: JEEP_WAVE_TICK, command: { type: 'startWave' } },
  ],
  until: 'end',
  expectations({ finalState, events }, expect) {
    const leaked = events.filter((e) => e.type === 'enemyLeaked');
    const killed = events.filter((e) => e.type === 'enemyKilled');
    // The nest stops all 3 Infantry and 2 of the 3 Jeeps; the last Jeep gets away.
    expect(killed.length).toBe(5);
    expect(leaked.length).toBe(1);
    expect(finalState.lives).toBe(START_LIVES - leaked.length);
  },
});

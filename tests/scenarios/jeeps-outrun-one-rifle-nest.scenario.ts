import { START_LIVES } from '../../src/data/start';
import { defineScenario } from './define';

// Infantry take ~20 s to cross the MVP Path, so wave 2 starts well after wave 1 is over.
const JEEP_WAVE_TICK = 1800;

export default defineScenario({
  description: 'A burst of Jeeps leaks past one Rifle Nest that stops the same number of Infantry.',
  towers: [{ kind: 'rifleNest', tile: { col: 1, row: 3 } }],
  waves: [
    { groups: [{ kind: 'infantry', count: 3, spacingMs: 300, delayMs: 0 }] },
    { groups: [{ kind: 'jeep', count: 3, spacingMs: 300, delayMs: 0 }] },
  ],
  script: [
    { atTick: 0, command: { type: 'startWave' } },
    { atTick: JEEP_WAVE_TICK, command: { type: 'startWave' } },
  ],
  until: 'end',
  expectations({ finalState, events }, expect) {
    const leaked = events.filter((e) => e.type === 'enemyLeaked');
    const killed = events.filter((e) => e.type === 'enemyKilled');
    // The nest stops all 3 Infantry, but at least one of the same number of Jeeps gets away.
    expect(killed.filter((e) => e.enemy.kind === 'infantry')).toHaveLength(3);
    expect(leaked.length).toBeGreaterThan(0);
    expect(leaked.every((e) => e.enemy.kind === 'jeep')).toBe(true);
    expect(finalState.lives).toBe(START_LIVES - leaked.length);
  },
});

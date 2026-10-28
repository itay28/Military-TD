import { ENEMY_STATS } from '../../src/data/enemies';
import { START_LIVES } from '../../src/data/start';
import { defineScenario } from './define';

// One of each enemy kind with no towers in the way. The delays spread them along the MVP Path, so 10 s in the Tank
// heads south, the Jeep and Helicopter east and the Infantry north: the e2e specs and screenshots use that moment.
export default defineScenario({
  description: 'One Infantry, Tank, Helicopter and Jeep walk the MVP Path together, unopposed, and all leak.',
  waves: [
    {
      groups: [
        { kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 },
        { kind: 'tank', count: 1, spacingMs: 0, delayMs: 0 },
        { kind: 'helicopter', count: 1, spacingMs: 0, delayMs: 0 },
        { kind: 'jeep', count: 1, spacingMs: 0, delayMs: 7000 },
      ],
    },
  ],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    const leaked = events.filter((e) => e.type === 'enemyLeaked');
    expect(leaked).toHaveLength(4);
    const cost = (['infantry', 'tank', 'helicopter', 'jeep'] as const).reduce(
      (sum, k) => sum + ENEMY_STATS[k].leakCost,
      0,
    );
    expect(finalState.lives).toBe(START_LIVES - cost);
  },
});

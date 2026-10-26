import { ENEMY_STATS } from '../../src/data/enemies';
import { START_LIVES } from '../../src/data/start';
import { defineScenario } from './define';

export default defineScenario({
  description: 'One Helicopter flies the MVP Path with no towers in the way and leaks, costing 2 Lives.',
  waves: [{ groups: [{ kind: 'helicopter', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    expect(events.filter((e) => e.type === 'enemyLeaked')).toHaveLength(1);
    expect(ENEMY_STATS.helicopter.leakCost).toBe(2);
    expect(finalState.lives).toBe(START_LIVES - 2);
  },
});

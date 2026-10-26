import { WAVES } from '../../src/data/waves';
import { defineScenario } from './define';

export default defineScenario({
  description: 'The full game with no towers: each wave starts as soon as allowed, and the leaks end it in Defeat.',
  autoStartWaves: true,
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('defeat');
    expect(finalState.lives).toBe(0);
    expect(finalState.totalWaves).toBe(WAVES.length);
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(0);
  },
});

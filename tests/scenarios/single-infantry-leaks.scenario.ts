import { START_LIVES } from '../../src/data/start';
import { defineScenario } from './define';

export default defineScenario({
  description: 'One Infantry walks the MVP Path with no towers in the way and leaks; the game is still won.',
  waves: [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    expect(events.filter((e) => e.type === 'enemyLeaked')).toHaveLength(1);
    expect(finalState.lives).toBe(START_LIVES - 1);
  },
});

import { defineScenario } from './define';

export default defineScenario({
  description: 'Balance bot: builds nothing and starts each wave at once. The leaks end it in Defeat by about wave 2.',
  autoStartWaves: true,
  until: 'end',
  expectations({ outcome, finalState }, expect) {
    expect(outcome).toBe('defeat');
    expect(finalState.waveNumber).toBeLessThanOrEqual(3);
  },
});

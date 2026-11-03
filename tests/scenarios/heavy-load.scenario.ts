import { HEAVY_LOAD } from '../../src/data/heavyLoad';
import { heavyLoadSetup } from '../../src/sim/heavyLoad';
import { defineScenario } from './define';

// The performance checks' Heavy load (#73, docs/performance.md). `__TD__.loadScenario('heavy-load')` gives the
// browser frame-time report this setup; the sim budget test builds the same game with `createHeavyLoadGame`.
export default defineScenario({
  description: `The Heavy load: ${HEAVY_LOAD.enemies} enemies against ${HEAVY_LOAD.towers} towers on Serpentine, seeded; the wave is still on after the measured ticks.`,
  ...heavyLoadSetup(),
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: { ticks: HEAVY_LOAD.warmupTicks + HEAVY_LOAD.measureTicks },
  expectations({ outcome, finalState }, expect) {
    expect(outcome).toBe('stopped');
    expect(finalState.phase).toBe('wave');
    expect(finalState.enemies.length).toBeGreaterThanOrEqual(100);
  },
});

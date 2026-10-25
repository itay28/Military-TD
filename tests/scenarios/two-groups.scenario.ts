import { START_LIVES } from '../../src/data/start';
import { TICK_MS } from '../../src/sim/game';
import { defineScenario } from './define';

const DELAY_MS = 3000;
const ticks = (ms: number) => Math.round(ms / TICK_MS);

export default defineScenario({
  description:
    'One wave of two Infantry groups, the second 3 s behind the first, walks the MVP Path with no towers: all four leak, and the wave clears only after the last one.',
  waves: [
    {
      groups: [
        { kind: 'infantry', count: 2, spacingMs: 500, delayMs: 0 },
        { kind: 'infantry', count: 2, spacingMs: 500, delayMs: DELAY_MS },
      ],
    },
  ],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: 'end',
  expectations({ outcome, finalState, events }, expect) {
    expect(outcome).toBe('victory');
    const leakTicks = events.filter((e) => e.type === 'enemyLeaked').map((e) => e.tick);
    expect(leakTicks).toHaveLength(4);
    expect(finalState.lives).toBe(START_LIVES - 4);
    // Same Path, same speed: each enemy leaks as long after the wave start as it spawned.
    const [first, second, third, fourth] = leakTicks as [number, number, number, number];
    expect(second - first).toBe(ticks(500));
    expect(third - first).toBe(ticks(DELAY_MS));
    expect(fourth - third).toBe(ticks(500));
    // The wave isn't cleared when the first group is gone, only after the second.
    const cleared = events.filter((e) => e.type === 'waveCleared').map((e) => e.tick);
    expect(cleared).toEqual([fourth]);
  },
});

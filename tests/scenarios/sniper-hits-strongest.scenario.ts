import { defineScenario } from './define';

export default defineScenario({
  description:
    'A Sniper with a Tank and an Infantry in range shoots the Tank (most HP), though the Infantry runs ahead of it.',
  towers: [{ kind: 'sniper', tile: { col: 1, row: 3 } }],
  waves: [
    {
      groups: [
        { kind: 'tank', count: 1, spacingMs: 0, delayMs: 0 },
        { kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 },
      ],
    },
  ],
  script: [{ atTick: 0, command: { type: 'callNextWave' } }],
  until: { ticks: 600 },
  expectations({ events }, expect) {
    const shots = events.filter((e) => e.type === 'towerFired');
    expect(shots.length).toBeGreaterThanOrEqual(2);
    // 70 damage less the Tank's 8 armor, 4 of it pierced: 66. An Infantry hit would be 30 (all its HP).
    for (const shot of shots.slice(0, 2)) expect(shot.hits[0]!.damage).toBe(66);
  },
});

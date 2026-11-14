import { defineScenario } from './define';

// The build bar's e2e spec (#365) opens it to build a tower and upgrade it to level 3 without waiting for wave pay.
export default defineScenario({
  description: 'An empty map in the build phase with 1000 Funds, one wave of Infantry not yet called.',
  money: 1000,
  waves: [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }],
  until: { ticks: 1 },
  expectations({ finalState }, expect) {
    expect(finalState.towers).toEqual([]);
    expect(finalState.money).toBe(1000);
  },
});

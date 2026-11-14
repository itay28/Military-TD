import { defineScenario } from './define';

// Sniper intel's e2e spec (#353) builds a Sniper and upgrades it to level 3 between waves, without waiting for wave pay.
export default defineScenario({
  description: "The first map's waves in the build phase, with 1000 Funds and no towers.",
  money: 1000,
  until: { ticks: 1 },
  expectations({ finalState }, expect) {
    expect(finalState.towers).toEqual([]);
    expect(finalState.money).toBe(1000);
    expect(finalState.waveNumber).toBe(0);
  },
});

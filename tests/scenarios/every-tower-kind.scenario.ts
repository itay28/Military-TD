import { defineScenario } from './define';

// One of each tower kind and plenty of Money to upgrade them: the e2e specs open it to look at every tower's panel.
export default defineScenario({
  description: 'One tower of each kind stands beside the Path, with Money to upgrade them all to the top level.',
  towers: [
    { kind: 'rifleNest', tile: { col: 1, row: 3 } },
    { kind: 'cannon', tile: { col: 5, row: 4 } },
    { kind: 'aaGun', tile: { col: 6, row: 5 } },
    { kind: 'mortar', tile: { col: 10, row: 4 } },
  ],
  money: 2000,
  until: { ticks: 1 },
  expectations({ finalState }, expect) {
    expect(finalState.towers.map((t) => t.kind)).toEqual(['rifleNest', 'cannon', 'aaGun', 'mortar']);
  },
});

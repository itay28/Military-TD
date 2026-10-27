import { START_LIVES } from '../../src/data/start';
import { buildOrder, type BuildStep } from './bots';
import { defineScenario } from './define';

/** A sensible mix: Rifle Nests early, a Cannon before the Tanks, AA before the Helicopters, then a Mortar and upgrades. */
export const BALANCED_ORDER: readonly BuildStep[] = [
  { place: 'rifleNest', tile: { col: 4, row: 6 } },
  { place: 'rifleNest', tile: { col: 9, row: 3 } },
  { place: 'cannon', tile: { col: 5, row: 5 } },
  { place: 'rifleNest', tile: { col: 7, row: 6 } },
  { upgrade: { col: 4, row: 6 }, level: 2 },
  { place: 'aaGun', tile: { col: 10, row: 4 } },
  { place: 'rifleNest', tile: { col: 11, row: 3 } },
  { place: 'cannon', tile: { col: 9, row: 5 } },
  { place: 'aaGun', tile: { col: 4, row: 4 } },
  { upgrade: { col: 5, row: 5 }, level: 2 },
  { place: 'mortar', tile: { col: 6, row: 4 } },
  { upgrade: { col: 10, row: 4 }, level: 2 },
  { upgrade: { col: 9, row: 3 }, level: 2 },
  { upgrade: { col: 7, row: 6 }, level: 2 },
  { upgrade: { col: 5, row: 5 }, level: 3 },
  { upgrade: { col: 10, row: 4 }, level: 3 },
  { upgrade: { col: 9, row: 5 }, level: 2 },
  { upgrade: { col: 4, row: 4 }, level: 2 },
  { upgrade: { col: 9, row: 5 }, level: 3 },
  { upgrade: { col: 4, row: 4 }, level: 3 },
  { upgrade: { col: 6, row: 4 }, level: 2 },
  { upgrade: { col: 6, row: 4 }, level: 3 },
];

export default defineScenario({
  description: 'Balance bot: a sensible mix of all four towers, with upgrades. Victory, losing a few Lives.',
  autoStartWaves: true,
  bot: buildOrder(BALANCED_ORDER),
  until: 'end',
  expectations({ outcome, finalState }, expect) {
    expect(outcome).toBe('victory');
    expect(finalState.lives).toBeLessThan(START_LIVES);
    expect(finalState.lives).toBeGreaterThanOrEqual(START_LIVES / 2);
  },
});

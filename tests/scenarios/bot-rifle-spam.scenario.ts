import { START_LIVES } from '../../src/data/start';
import { buildOrder } from './bots';
import { defineScenario } from './define';

/** Tiles along the Path, the ones covering the most of it first. */
const RIFLE_TILES = [
  { col: 4, row: 6 },
  { col: 7, row: 6 },
  { col: 9, row: 3 },
  { col: 11, row: 3 },
  { col: 2, row: 3 },
  { col: 11, row: 5 },
  { col: 4, row: 3 },
  { col: 7, row: 3 },
  { col: 9, row: 6 },
  { col: 2, row: 6 },
  { col: 5, row: 8 },
  { col: 13, row: 5 },
  { col: 10, row: 1 },
  { col: 4, row: 5 },
  { col: 7, row: 5 },
  { col: 9, row: 4 },
  { col: 11, row: 4 },
  { col: 2, row: 1 },
  { col: 6, row: 1 },
  { col: 14, row: 7 },
] as const;

export default defineScenario({
  description: 'Balance bot: Rifle Nests only, placed as Money allows, never upgraded. It struggles.',
  autoStartWaves: true,
  bot: buildOrder(RIFLE_TILES.map((tile) => ({ place: 'rifleNest', tile }))),
  until: 'end',
  expectations({ outcome, finalState }, expect) {
    if (outcome === 'victory') expect(finalState.lives).toBeLessThanOrEqual(START_LIVES / 4);
    else expect(outcome).toBe('defeat');
  },
});

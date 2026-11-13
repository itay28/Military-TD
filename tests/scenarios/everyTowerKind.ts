import { mapById } from '../../src/data/maps';
import { BUILD_KINDS } from '../../src/data/towers';
import { fitOrder } from './bots';
import { defineScenario } from './define';

/**
 * One tower of each kind in play, each on the free buildable tile of `mapId` that covers the most Path, and no waves
 * started: the e2e specs open it to see every tower drawn in that map's Faction set (#567).
 */
export function everyTowerKindOn(mapId: string) {
  const map = mapById(mapId);
  const towers = fitOrder(
    map.data,
    BUILD_KINDS.map((kind) => ({ place: kind, tile: { col: 0, row: 0 } })),
  ).flatMap((step) => ('place' in step ? [{ kind: step.place, tile: step.tile }] : []));
  return defineScenario({
    description: `One tower of each kind in play stands beside the Path on ${map.name}.`,
    map: map.data,
    waves: map.waves,
    towers,
    until: { ticks: 1 },
    expectations({ finalState }, expect) {
      expect(finalState.map.id).toBe(mapId);
      expect(finalState.towers.map((t) => t.kind)).toEqual([...BUILD_KINDS]);
    },
  });
}

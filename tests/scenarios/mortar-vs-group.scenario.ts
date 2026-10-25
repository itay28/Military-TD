import type { MapData } from '../../src/sim/map';
import { defineScenario } from './define';

// A straight Path along y = 2.5, so distances along it are distances on the map.
const STRAIGHT: MapData = {
  id: 'straight',
  cols: 16,
  rows: 10,
  waypoints: [
    { col: 0, row: 2 },
    { col: 15, row: 2 },
  ],
};

// Infantry walks 1.5 tiles/s, so 400 ms apart is 0.6 tiles apart. The first shell is aimed at the leader and lands
// 1 s later: by then the leader is 1.5 tiles past the landing point (out of the 1.25 outer ring), the 2nd 0.9 past
// (outer ring), the 3rd and 4th 0.3 either side (inner ring, 0.6), the 5th 0.9 short (outer ring).
export default defineScenario({
  description: 'One Mortar shell lands on a tight group of Infantry: full damage in the inner ring, half in the outer.',
  map: STRAIGHT,
  towers: [{ kind: 'mortar', tile: { col: 10, row: 4 } }],
  waves: [{ kind: 'infantry', count: 5, spacingMs: 400 }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: { event: 'shellLanded' },
  expectations({ events, finalState }, expect) {
    const fired = events.filter((e) => e.type === 'shellFired');
    const landed = events.filter((e) => e.type === 'shellLanded');
    expect(fired).toHaveLength(1);
    expect(landed).toHaveLength(1);
    // Hits come in spawn order, 2nd to 5th; the leader got away. 40 in the inner ring kills a 30 HP Infantry
    // (the hit reports the 30 it had); 20 in the outer ring leaves 10.
    const [leader] = finalState.enemies;
    expect(landed[0]!.hits.map((hit) => hit.damage)).toEqual([20, 30, 30, 20]);
    expect(landed[0]!.hits.map((hit) => hit.enemyId)).not.toContain(leader!.id);
    expect(events.filter((e) => e.type === 'enemyKilled')).toHaveLength(2);
    expect(finalState.enemies.map((enemy) => enemy.hp)).toEqual([30, 10, 10]);
  },
});

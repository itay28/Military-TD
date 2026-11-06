import { TOWER_STATS } from '../../src/data/towers';
import type { MapData } from '../../src/sim/map';
import { defineScenario } from './define';

// A straight Path along y = 2.5 that starts beside the launcher: its tile center (1.5, 3.5) is about 1.4 tiles from
// where Infantry enters (0.5, 2.5), so the first grenade lands inside the Mortar's 1.5-tile dead zone, which the
// launcher lacks.
const STRAIGHT: MapData = {
  id: 'straight',
  cols: 16,
  rows: 10,
  waypoints: [
    { col: 0, row: 2 },
    { col: 15, row: 2 },
  ],
};

// Infantry walks 1.5 tiles/s, so 150 ms apart is 0.225 tiles apart: a tight group the small blast (0.35 / 0.7 rings)
// catches several of. A grenade flies 0.4 s, in which an enemy walks 0.6 tiles: the leader it was aimed at is in the
// outer ring when it lands, the next ones closer in.
export default defineScenario({
  description: 'An automatic grenade launcher up close: one grenade splashes a tight group of Infantry.',
  map: STRAIGHT,
  towers: [{ kind: 'grenadeLauncher', tile: { col: 1, row: 3 } }],
  waves: [{ groups: [{ kind: 'infantry', count: 6, spacingMs: 150, delayMs: 0 }] }],
  script: [{ atTick: 0, command: { type: 'startWave' } }],
  until: { event: 'shellLanded' },
  expectations({ events }, expect) {
    const landed = events.filter((e) => e.type === 'shellLanded');
    expect(landed).toHaveLength(1);
    const [blast] = landed;
    // It fires up close, where a Mortar can't.
    const { x, y } = blast!.position;
    expect(Math.hypot(x - 1.5, y - 3.5)).toBeLessThan(TOWER_STATS.mortar.minRange);
    // Several enemies take it: the inner ring's full 14, the outer ring's 7.
    expect(blast!.hits.length).toBeGreaterThanOrEqual(3);
    expect(blast!.hits.filter((hit) => hit.damage === 14).length).toBeGreaterThanOrEqual(1);
    expect(blast!.hits.every((hit) => hit.damage === 14 || hit.damage === 7)).toBe(true);
  },
});

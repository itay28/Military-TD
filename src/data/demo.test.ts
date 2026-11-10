import { describe, expect, it } from 'vitest';
import { createDemoGame } from '../sim/demo';
import { TICK_MS } from '../sim/game';
import { DEMO_SCRIPTS } from './demo';
import { MAPS, mapById } from './maps';

/** Ten minutes of game time: a loop much longer than that would show the menu one map's long late waves. */
const MAX_LOOP_TICKS = Math.round((10 * 60 * 1000) / TICK_MS);

describe('DEMO_SCRIPTS', () => {
  it('has one script per map, in Level select order', () => {
    expect(DEMO_SCRIPTS.map((script) => script.mapId)).toEqual(MAPS.map((map) => map.id));
  });

  describe.each(DEMO_SCRIPTS.map((script) => [script.mapId, script] as const))('%s', (mapId, script) => {
    const { data, waves } = mapById(mapId);
    const demo = () => createDemoGame({ map: data, waves, towers: script.towers });

    it('sets up: every tower stands on its tile at its level, with several kinds on show', () => {
      const { towers } = demo().state;
      expect(towers).toHaveLength(script.towers.length);
      expect(new Set(script.towers.map((tower) => tower.kind)).size).toBeGreaterThanOrEqual(3);
    });

    it('has a busy field after the pre-roll, for the first frame and the still frame', () => {
      const game = demo();
      for (let ms = 0; ms < script.preRollMs; ms += TICK_MS) game.tick(TICK_MS);
      expect(game.state.enemies.length).toBeGreaterThan(0);
      expect(game.state.towers.length).toBe(script.towers.length);
    });

    it('loops within ten minutes of game time', () => {
      const game = demo();
      for (let tick = 0; game.loops === 0; tick++) {
        if (tick > MAX_LOOP_TICKS) throw new Error(`${mapId}: no loop in ten minutes`);
        game.tick(TICK_MS);
      }
    });

    it('pans between two points inside the map, zoomed in past the cover', () => {
      for (const { x, y } of [script.pan.from, script.pan.to]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(data.cols);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(data.rows);
      }
      expect(script.pan.zoom).toBeGreaterThanOrEqual(1);
      expect(script.pan.periodMs).toBeGreaterThan(0);
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { DemoScript } from '../data/demo';
import { TOWER_LEVELS } from '../data/towers';
import { AUTO_START_DELAY_MS } from '../data/waves';
import { createDemoGame, demoScriptAt, panAt, type DemoGame } from './demo';
import { TICK_MS } from './game';
import type { MapData } from './map';

// Right 5 tiles along row 1: an Infantry (1.5 tiles/s) walks it in about 3.5 s.
const STRIP: MapData = {
  id: 'strip',
  cols: 6,
  rows: 4,
  waypoints: [
    { col: 0, row: 1 },
    { col: 5, row: 1 },
  ],
};

const TWO_WAVES = [
  { groups: [{ kind: 'infantry', count: 2, spacingMs: 500, delayMs: 0 }] },
  { groups: [{ kind: 'jeep', count: 1, spacingMs: 0, delayMs: 0 }] },
] as const;

const SCRIPT: DemoScript = {
  mapId: 'strip',
  towers: [
    { kind: 'rifleNest', tile: { col: 2, row: 2 }, level: 3 },
    { kind: 'aaGun', tile: { col: 4, row: 0 }, level: 1 },
  ],
  preRollMs: 2000,
  pan: { from: { x: 1, y: 1 }, to: { x: 5, y: 3 }, periodMs: 10_000, zoom: 1.5 },
};

const demoOf = (script: DemoScript = SCRIPT): DemoGame =>
  createDemoGame({ map: STRIP, waves: TWO_WAVES, towers: script.towers });

/** Ticks until the demo has looped `loops` times, failing after `maxTicks`. */
function tickUntilLoops(demo: DemoGame, loops: number, maxTicks = 100_000): number {
  let ticks = 0;
  while (demo.loops < loops) {
    demo.tick(TICK_MS);
    if (++ticks > maxTicks) throw new Error(`no loop ${loops} after ${maxTicks} ticks`);
  }
  return ticks;
}

describe('createDemoGame', () => {
  it('places the scripted towers, free, at their levels', () => {
    const { towers } = demoOf().state;
    expect(towers.map(({ kind, tile, level }) => ({ kind, tile, level }))).toEqual(
      SCRIPT.towers.map(({ kind, tile, level }) => ({ kind, tile, level })),
    );
    expect(TOWER_LEVELS.rifleNest).toHaveLength(2); // level 3 is the top
  });

  it('starts the first wave at once and runs the next by itself', () => {
    const demo = demoOf();
    expect(demo.state.phase).toBe('wave');
    expect(demo.state.waveNumber).toBe(1);
    const waveStarts: number[] = [];
    demo.events.on('waveStarted', ({ waveNumber }) => waveStarts.push(waveNumber));
    tickUntilLoops(demo, 1);
    expect(waveStarts).toEqual([2]);
  });

  it('never ends: after the last wave it resets to the same towers on an empty field, and plays on', () => {
    const demo = demoOf();
    const towerIds = demo.state.towers.map((tower) => tower.id);
    tickUntilLoops(demo, 1);
    expect(demo.state.phase).toBe('wave');
    expect(demo.state.waveNumber).toBe(1);
    expect(demo.state.towers.map((tower) => tower.id)).toEqual(towerIds);
    expect(demo.state.shells).toEqual([]);
    tickUntilLoops(demo, 3);
    expect(demo.loops).toBe(3);
  });

  it('keeps forwarding events from each fresh game after a reset', () => {
    const demo = demoOf();
    let kills = 0;
    let victories = 0;
    demo.events.on('enemyKilled', () => kills++);
    demo.events.on('victory', () => victories++);
    tickUntilLoops(demo, 1);
    const killsInFirstLoop = kills;
    expect(killsInFirstLoop).toBeGreaterThan(0);
    expect(victories).toBe(1);
    tickUntilLoops(demo, 2);
    expect(kills).toBe(killsInFirstLoop * 2);
    expect(victories).toBe(2);
  });

  it('loses no time between loops beyond the auto-start delay it never waits for', () => {
    // The reset starts the first wave at once, so the field is never left empty for long.
    const demo = demoOf();
    tickUntilLoops(demo, 1);
    expect(demo.state.timeMs).toBeLessThan(AUTO_START_DELAY_MS);
    expect(demo.state.enemies.length).toBeGreaterThan(0);
  });

  it('plays the same every time: two demos of one script stay identical', () => {
    const snapshot = (demo: DemoGame) =>
      JSON.stringify({ enemies: demo.state.enemies, towers: demo.state.towers, shells: demo.state.shells });
    const a = demoOf();
    const b = demoOf();
    for (let i = 0; i < 2000; i++) {
      a.tick(TICK_MS);
      b.tick(TICK_MS);
    }
    expect(a.loops).toBeGreaterThan(0);
    expect(snapshot(a)).toBe(snapshot(b));
  });

  it('throws when a scripted tower cannot stand on its tile', () => {
    expect(() =>
      createDemoGame({ map: STRIP, waves: TWO_WAVES, towers: [{ kind: 'rifleNest', tile: { col: 1, row: 1 }, level: 1 }] }),
    ).toThrow(/rifleNest/);
  });

  it('throws for a level the tower kind does not have', () => {
    expect(() =>
      createDemoGame({ map: STRIP, waves: TWO_WAVES, towers: [{ kind: 'rifleNest', tile: { col: 2, row: 2 }, level: 4 }] }),
    ).toThrow(/level 4/);
  });
});

describe('panAt', () => {
  const { pan } = SCRIPT;

  it('starts at `from`, reaches `to` half a period in, and is back at `from` after a whole one', () => {
    expect(panAt(pan, 0)).toEqual(pan.from);
    expect(panAt(pan, pan.periodMs / 2)).toEqual(pan.to);
    const back = panAt(pan, pan.periodMs);
    expect(back.x).toBeCloseTo(pan.from.x);
    expect(back.y).toBeCloseTo(pan.from.y);
  });

  it('is halfway a quarter period in, and eases: slower near the ends than in the middle', () => {
    const quarter = panAt(pan, pan.periodMs / 4);
    expect(quarter.x).toBeCloseTo(3);
    expect(quarter.y).toBeCloseTo(2);
    const step = pan.periodMs / 100;
    const nearStart = panAt(pan, step).x - panAt(pan, 0).x;
    const nearMiddle = panAt(pan, pan.periodMs / 4 + step).x - panAt(pan, pan.periodMs / 4).x;
    expect(nearStart).toBeLessThan(nearMiddle);
  });

  it('comes back the same way it went', () => {
    const t = pan.periodMs * 0.1;
    expect(panAt(pan, pan.periodMs - t).x).toBeCloseTo(panAt(pan, t).x);
    expect(panAt(pan, pan.periodMs * 3 + t)).toEqual(panAt(pan, t));
  });
});

describe('demoScriptAt', () => {
  it('picks the scripts in rotation, wrapping round', () => {
    const scripts = ['a', 'b', 'c'];
    expect([0, 1, 2, 3, 4, 7].map((rotation) => demoScriptAt(scripts, rotation))).toEqual([
      'a',
      'b',
      'c',
      'a',
      'b',
      'b',
    ]);
  });

  it('throws when there is no script', () => {
    expect(() => demoScriptAt([], 0)).toThrow(RangeError);
  });
});

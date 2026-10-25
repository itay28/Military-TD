import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import { ENEMY_STYLE, GHOST, HP_BAR, RANGE_RING, TILE_PX, TOWER_STYLE, TRACER_STYLE } from '../data/display';
import { TOWER_STATS } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import type { Tower } from '../sim/towers';
import { drawEnemy, drawGhost, drawRangeRing, drawTower, drawTracers, type EntityPainter } from './drawEntities';

type Call = [string, ...number[]];

/** Records every painter call in order, with its arguments. */
function recordingPainter() {
  const calls: Call[] = [];
  const record =
    (name: string) =>
    (...args: (number | undefined)[]) =>
      calls.push([name, ...args.filter((a): a is number => a !== undefined)]);
  const painter: EntityPainter = {
    fillStyle: record('fillStyle'),
    fillCircle: record('fillCircle'),
    fillRect: record('fillRect'),
    lineStyle: record('lineStyle'),
    strokeRect: record('strokeRect'),
    strokeCircle: record('strokeCircle'),
    lineBetween: record('lineBetween'),
  };
  return { painter, calls };
}

const infantry = (hp: number): Enemy => ({
  ...ENEMY_STATS.infantry,
  id: 1,
  kind: 'infantry',
  hp,
  distance: 0,
  position: { x: 0.5, y: 0.5 },
});

const rifleNest = (id: number, col: number, row: number): Tower => ({
  ...TOWER_STATS.rifleNest,
  id,
  kind: 'rifleNest',
  tile: { col, row },
  cooldownMs: 0,
});

describe('drawEnemy', () => {
  const { radius, color } = ENEMY_STYLE.infantry;
  const barTop = -radius - HP_BAR.gap - HP_BAR.height;

  it('draws a circle of its kind’s radius and color at the origin', () => {
    const { painter, calls } = recordingPainter();
    drawEnemy(painter, infantry(30));
    expect(calls.slice(0, 2)).toEqual([
      ['fillStyle', color],
      ['fillCircle', 0, 0, radius],
    ]);
  });

  it('draws a full HP bar centered above the circle at max HP', () => {
    const { painter, calls } = recordingPainter();
    drawEnemy(painter, infantry(30));
    expect(calls.slice(2)).toEqual([
      ['fillStyle', HP_BAR.back, HP_BAR.backAlpha],
      ['fillRect', -HP_BAR.width / 2, barTop, HP_BAR.width, HP_BAR.height],
      ['fillStyle', HP_BAR.fill],
      ['fillRect', -HP_BAR.width / 2, barTop, HP_BAR.width, HP_BAR.height],
    ]);
  });

  it('shrinks the HP bar fill in proportion to HP lost', () => {
    const { painter, calls } = recordingPainter();
    drawEnemy(painter, infantry(10)); // a third of 30
    const fill = calls[calls.length - 1];
    expect(fill).toEqual(['fillRect', -HP_BAR.width / 2, barTop, HP_BAR.width / 3, HP_BAR.height]);
  });
});

describe('drawTower', () => {
  it('draws a filled, outlined square of its kind’s size centered on the origin', () => {
    const { painter, calls } = recordingPainter();
    drawTower(painter, rifleNest(1, 0, 0));
    const { size, fill, outline, outlineWidth } = TOWER_STYLE.rifleNest;
    const half = size / 2;
    expect(calls).toEqual([
      ['fillStyle', fill],
      ['fillRect', -half, -half, size, size],
      ['lineStyle', outlineWidth, outline],
      ['strokeRect', -half, -half, size, size],
    ]);
  });
});

describe('drawRangeRing', () => {
  it('strokes a circle of the tower’s range, in pixels, around the origin', () => {
    const { painter, calls } = recordingPainter();
    drawRangeRing(painter, rifleNest(1, 0, 0));
    expect(calls).toEqual([
      ['lineStyle', RANGE_RING.width, RANGE_RING.color, RANGE_RING.alpha],
      ['strokeCircle', 0, 0, 2.5 * TILE_PX],
    ]);
  });
});

describe('drawTracers', () => {
  it("draws one line per tracer in its tower's style, at its alpha", () => {
    const { painter, calls } = recordingPainter();
    drawTracers(painter, [
      { from: { x: 0, y: 0 }, to: { x: 10, y: 20 }, kind: 'rifleNest', alpha: 1 },
      { from: { x: 5, y: 5 }, to: { x: 6, y: 7 }, kind: 'cannon', alpha: 0.5 },
    ]);
    const { rifleNest, cannon } = TRACER_STYLE;
    expect(calls).toEqual([
      ['lineStyle', rifleNest.width, rifleNest.color, 1],
      ['lineBetween', 0, 0, 10, 20],
      ['lineStyle', cannon.width, cannon.color, 0.5],
      ['lineBetween', 5, 5, 6, 7],
    ]);
  });

  it("a Cannon's tracer is heavier than a Rifle Nest's", () => {
    expect(TRACER_STYLE.cannon.width).toBeGreaterThan(TRACER_STYLE.rifleNest.width);
  });
});

describe('drawGhost', () => {
  const { size } = TOWER_STYLE.rifleNest;
  const half = size / 2;
  const ghostCalls = (color: number) => [
    ['fillStyle', color, GHOST.fillAlpha],
    ['fillRect', -half, -half, size, size],
    ['lineStyle', GHOST.ringWidth, color, GHOST.ringAlpha],
    ['strokeCircle', 0, 0, 2.5 * TILE_PX],
  ];

  it('draws a see-through tower square and its range ring in green where placement would succeed', () => {
    const { painter, calls } = recordingPainter();
    drawGhost(painter, 'rifleNest', true);
    expect(calls).toEqual(ghostCalls(GHOST.placeable));
  });

  it('draws them in red where placement would be refused', () => {
    const { painter, calls } = recordingPainter();
    drawGhost(painter, 'rifleNest', false);
    expect(calls).toEqual(ghostCalls(GHOST.blocked));
  });
});

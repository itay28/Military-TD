import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import {
  AIR_SHADOW,
  ENEMY_STYLE,
  GHOST,
  HP_BAR,
  LEVEL_PIP,
  RANGE_RING,
  ROTOR,
  SHELL,
  TILE_PX,
  TOWER_STYLE,
  TRACER_STYLE,
} from '../data/display';
import { TOWER_STATS } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import type { Tower } from '../sim/towers';
import {
  drawBlasts,
  drawEnemy,
  drawGhost,
  drawRangeRing,
  drawShells,
  drawTower,
  drawTracers,
  type EntityPainter,
} from './drawEntities';

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
  level: 1,
  spent: 50,
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

  it('draws a Jeep as a square in its own color', () => {
    const { painter, calls } = recordingPainter();
    const { radius: r, color: c } = ENEMY_STYLE.jeep;
    drawEnemy(painter, { ...infantry(20), ...ENEMY_STATS.jeep, kind: 'jeep', hp: 20 });
    expect(calls.slice(0, 2)).toEqual([
      ['fillStyle', c],
      ['fillRect', -r, -r, r * 2, r * 2],
    ]);
    expect(c).not.toBe(color);
  });

  it('draws a full HP bar centered above the shape at max HP', () => {
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

describe('drawEnemy (Helicopter)', () => {
  const helicopter: Enemy = {
    ...ENEMY_STATS.helicopter,
    id: 2,
    kind: 'helicopter',
    hp: 60,
    distance: 0,
    position: { x: 0.5, y: 0.5 },
  };
  const { radius, color } = ENEMY_STYLE.helicopter;

  it('draws a shadow offset below it first, then its body in its own color', () => {
    const { painter, calls } = recordingPainter();
    drawEnemy(painter, helicopter);
    expect(calls.slice(0, 4)).toEqual([
      ['fillStyle', AIR_SHADOW.color, AIR_SHADOW.alpha],
      ['fillCircle', AIR_SHADOW.offsetX, AIR_SHADOW.offsetY, radius],
      ['fillStyle', color],
      ['fillCircle', 0, 0, radius],
    ]);
    expect(color).not.toBe(ENEMY_STYLE.infantry.color);
  });

  it('draws an X rotor over its body, before the HP bar', () => {
    const { painter, calls } = recordingPainter();
    drawEnemy(painter, helicopter);
    const s = ENEMY_STYLE.helicopter.rotor;
    expect(calls.slice(4, 7)).toEqual([
      ['lineStyle', ROTOR.width, ROTOR.color],
      ['lineBetween', -s, -s, s, s],
      ['lineBetween', -s, s, s, -s],
    ]);
  });

  it('gives a ground enemy no rotor', () => {
    const { painter, calls } = recordingPainter();
    drawEnemy(painter, infantry(30));
    expect(calls.some((c) => c[0] === 'lineBetween')).toBe(false);
  });

  it('gives a ground enemy no shadow', () => {
    const { painter, calls } = recordingPainter();
    drawEnemy(painter, infantry(30));
    expect(calls.some((c) => c[0] === 'fillStyle' && c[1] === AIR_SHADOW.color)).toBe(false);
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

  it('adds one level pip per upgrade, in a row along the bottom edge', () => {
    const { painter, calls } = recordingPainter();
    drawTower(painter, { ...rifleNest(1, 0, 0), level: 3 });
    const { size: pip, gap, inset, color } = LEVEL_PIP;
    const half = TOWER_STYLE.rifleNest.size / 2;
    const top = half - inset - pip;
    expect(calls.slice(4)).toEqual([
      ['fillStyle', color],
      ['fillRect', -half + inset, top, pip, pip],
      ['fillRect', -half + inset + pip + gap, top, pip, pip],
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

describe('drawShells', () => {
  it('draws a dot per shell', () => {
    const { painter, calls } = recordingPainter();
    drawShells(painter, [{ x: 10, y: 20 }]);
    expect(calls).toEqual([
      ['fillStyle', SHELL.color],
      ['fillCircle', 10, 20, SHELL.radius],
    ]);
  });
});

describe('drawBlasts', () => {
  it('draws a circle outline per blast, at its alpha', () => {
    const { painter, calls } = recordingPainter();
    drawBlasts(painter, [{ center: { x: 10, y: 20 }, radius: 48, alpha: 0.5 }]);
    expect(calls).toEqual([
      ['lineStyle', SHELL.blastWidth, SHELL.blastColor, 0.5],
      ['strokeCircle', 10, 20, 48],
    ]);
  });
});

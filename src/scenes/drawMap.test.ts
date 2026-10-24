import { describe, expect, it } from 'vitest';
import { MAP_COLORS, TILE_PX } from '../data/display';
import { MVP_MAP } from '../data/maps';
import { createMap, type MapData } from '../sim/map';
import { drawMap, type MapPainter } from './drawMap';

interface Fill {
  color: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Records what drawMap paints, keeping track of the current fill color. */
function recordingPainter() {
  const fills: Fill[] = [];
  const lines: Line[] = [];
  const lineStyles: { width: number; color: number; alpha: number | undefined }[] = [];
  let fillColor = -1;
  const painter: MapPainter = {
    fillStyle: (color) => (fillColor = color),
    fillRect: (x, y, w, h) => fills.push({ color: fillColor, x, y, w, h }),
    lineStyle: (width, color, alpha) => lineStyles.push({ width, color, alpha }),
    lineBetween: (x1, y1, x2, y2) => lines.push({ x1, y1, x2, y2 }),
  };
  return { painter, fills, lines, lineStyles };
}

// A 3×2 grid; the Path runs along the top row.
const TINY: MapData = {
  id: 'tiny',
  cols: 3,
  rows: 2,
  waypoints: [
    { col: 0, row: 0 },
    { col: 2, row: 0 },
  ],
};

describe('drawMap', () => {
  it('fills every tile once: Path tiles in the path color, the rest in the buildable color', () => {
    const { painter, fills } = recordingPainter();
    drawMap(painter, createMap(TINY));
    const at = (col: number, row: number) => fills.filter((f) => f.x === col * TILE_PX && f.y === row * TILE_PX);
    expect(fills).toHaveLength(6);
    expect(fills.every((f) => f.w === TILE_PX && f.h === TILE_PX)).toBe(true);
    for (const col of [0, 1, 2]) {
      expect(at(col, 0).map((f) => f.color)).toEqual([MAP_COLORS.path]);
      expect(at(col, 1).map((f) => f.color)).toEqual([MAP_COLORS.buildable]);
    }
  });

  it('draws subtle grid lines on every tile edge, across the whole map', () => {
    const { painter, lines, lineStyles } = recordingPainter();
    drawMap(painter, createMap(TINY));
    const vertical = lines.filter((l) => l.x1 === l.x2);
    const horizontal = lines.filter((l) => l.y1 === l.y2);
    expect(vertical.map((l) => l.x1)).toEqual([0, 48, 96, 144]);
    expect(horizontal.map((l) => l.y1)).toEqual([0, 48, 96]);
    expect(vertical.every((l) => l.y1 === 0 && l.y2 === 2 * TILE_PX)).toBe(true);
    expect(horizontal.every((l) => l.x1 === 0 && l.x2 === 3 * TILE_PX)).toBe(true);
    expect(lineStyles).toEqual([{ width: 1, color: MAP_COLORS.grid, alpha: MAP_COLORS.gridAlpha }]);
  });

  it('draws the MVP map with only the map in the sim (no enemies or towers)', () => {
    const { painter, fills } = recordingPainter();
    const map = createMap(MVP_MAP);
    drawMap(painter, map);
    expect(fills).toHaveLength(16 * 10);
    expect(fills.filter((f) => f.color === MAP_COLORS.path)).toHaveLength(map.pathTiles.length);
  });
});

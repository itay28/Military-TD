// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MAP_CARD, MAP_GRID } from '../data/display';
import { MAPS, mapById } from '../data/maps';
import { createMap } from '../sim/map';
import { buildMapCard, drawTacticalOverlay, tacticalOverlay, type OverlayContext } from './mapCard';
import { PREVIEW_TILE_PX } from './mapPreview';

const training = createMap(mapById('mvp').data);

describe('tacticalOverlay (#401)', () => {
  const overlay = tacticalOverlay(training, PREVIEW_TILE_PX);

  it('is the map’s size at the card’s tile size', () => {
    expect(overlay.width).toBe(training.cols * PREVIEW_TILE_PX);
    expect(overlay.height).toBe(training.rows * PREVIEW_TILE_PX);
  });

  it('draws the map grid every MAP_GRID.cellTiles tiles, inside the map', () => {
    const cellPx = MAP_GRID.cellTiles * PREVIEW_TILE_PX;
    // 16 × 10 tiles in 4-tile cells: verticals at 4, 8, 12 tiles; horizontals at 4, 8.
    expect(overlay.gridLines).toEqual([
      { x1: cellPx, y1: 0, x2: cellPx, y2: overlay.height },
      { x1: 2 * cellPx, y1: 0, x2: 2 * cellPx, y2: overlay.height },
      { x1: 3 * cellPx, y1: 0, x2: 3 * cellPx, y2: overlay.height },
      { x1: 0, y1: cellPx, x2: overlay.width, y2: cellPx },
      { x1: 0, y1: 2 * cellPx, x2: overlay.width, y2: 2 * cellPx },
    ]);
  });

  it('runs the route through every waypoint’s tile centre, entry to exit', () => {
    const centre = ({ col, row }: { col: number; row: number }) => ({
      x: (col + 0.5) * PREVIEW_TILE_PX,
      y: (row + 0.5) * PREVIEW_TILE_PX,
    });
    expect(overlay.route).toEqual(training.waypoints.map(centre));
    expect(overlay.entry).toEqual(centre(training.waypoints[0]!));
    expect(overlay.exit).toEqual(centre(training.waypoints.at(-1)!));
  });

  it('gives the grid reference of the exit, where HQ stands', () => {
    // Training Ground exits at col 15, row 6: grid column D (cols 12–15), row 2 (rows 4–7).
    expect(overlay.gridRef).toBe('D2');
  });

  it.each(MAPS)('$id: has a grid reference', (entry) => {
    expect(tacticalOverlay(createMap(entry.data), PREVIEW_TILE_PX).gridRef).toMatch(/^[A-Z]+\d+$/);
  });
});

/** A 2D context that records what is drawn. */
function recorder() {
  const calls: string[] = [];
  const state = { strokeStyle: '', fillStyle: '', lineWidth: 0, globalAlpha: 1, font: '', textBaseline: '' };
  let dash: number[] = [];
  const ctx = {
    ...state,
    setLineDash(segments: number[]) {
      dash = segments;
      calls.push(`dash ${segments.join(',')}`);
    },
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`move ${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`line ${x},${y}`),
    stroke() {
      calls.push(`stroke ${ctx.strokeStyle} dash=${dash.join(',')}`);
    },
    fill() {
      calls.push(`fill ${ctx.fillStyle}`);
    },
    arc: (x: number, y: number) => calls.push(`arc ${x},${y}`),
    closePath: () => calls.push('close'),
    fillRect: (x: number, y: number) => calls.push(`rect ${x},${y}`),
    fillText: (text: string) => calls.push(`text ${text}`),
    strokeText: (text: string) => calls.push(`stroketext ${text}`),
  };
  return { ctx: ctx as unknown as OverlayContext, calls };
}

describe('drawTacticalOverlay (#401)', () => {
  const overlay = tacticalOverlay(training, PREVIEW_TILE_PX);
  const { ctx, calls } = recorder();
  drawTacticalOverlay(ctx, overlay);

  it('strokes the route as a dashed red line through every route point', () => {
    const routeStroke = calls.indexOf(`stroke ${MAP_CARD.route.color} dash=${MAP_CARD.route.dash.join(',')}`);
    expect(routeStroke).toBeGreaterThan(-1);
    for (const { x, y } of overlay.route.slice(1)) expect(calls).toContain(`line ${x},${y}`);
  });

  it('strokes the grid lines solid', () => {
    expect(calls).toContain(`stroke ${MAP_CARD.grid.color} dash=`);
  });

  it('marks the entry and the exit', () => {
    expect(calls).toContain(`fill ${MAP_CARD.entry.color}`);
    expect(calls).toContain(`fill ${MAP_CARD.exit.color}`);
  });

  it('writes the grid reference', () => {
    expect(calls).toContain(`text GRID ${overlay.gridRef}`);
  });
});

describe('buildMapCard (#401)', () => {
  it('lays the map’s aerial ground image under the overlay, both hidden from screen readers', () => {
    const entry = mapById('mvp');
    const card = buildMapCard(document, entry);
    const img = card.querySelector('img');
    expect(img?.getAttribute('src')).toBe(entry.groundImageUrl);
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect(img?.getAttribute('alt')).toBe('');
    const canvas = card.querySelector('canvas');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.width).toBe(entry.data.cols * PREVIEW_TILE_PX);
    expect(card.querySelector('[data-testid="map-ground"]')).toBe(img);
  });

  it('falls back to the drawn tileset preview under the overlay when the map has no aerial image yet', () => {
    const entry = { ...mapById('mvp'), groundImageUrl: undefined };
    const card = buildMapCard(document, entry);
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('canvas')?.dataset.ground).toBe('drawn');
  });
});

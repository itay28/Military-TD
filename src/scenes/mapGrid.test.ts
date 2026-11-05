import { describe, expect, it } from 'vitest';
import { TILE_PX as T } from '../data/display';
import type { CameraBounds, CameraView } from './camera';
import { columnLetters, edgeLabels, gridLabel } from './mapGrid';

describe('columnLetters', () => {
  it('counts A…Z, then AA, AB…', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnLetters)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});

describe('gridLabel', () => {
  it('names the 4×4 cell a tile is in: columns from A, rows from 1', () => {
    expect(gridLabel({ col: 0, row: 0 })).toBe('A1');
    expect(gridLabel({ col: 3, row: 3 })).toBe('A1');
    expect(gridLabel({ col: 4, row: 3 })).toBe('B1');
    expect(gridLabel({ col: 8, row: 12 })).toBe('C4');
    expect(gridLabel({ col: 15, row: 9 })).toBe('D3');
  });

  it('takes the cell size in tiles', () => {
    expect(gridLabel({ col: 5, row: 5 }, 2)).toBe('C3');
  });
});

describe('edgeLabels', () => {
  const world = { width: 16 * T, height: 10 * T };
  const bounds: CameraBounds = { viewport: { width: 16 * T, height: 10 * T }, world, maxZoom: 4 };
  const fit: CameraView = { scrollX: 0, scrollY: 0, zoom: 1 };

  it('labels every column on the top edge and every row on the left edge when the whole map shows', () => {
    const { columns, rows } = edgeLabels(fit, bounds, 4);
    expect(columns.map((label) => label.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(rows.map((label) => label.text)).toEqual(['1', '2', '3']);
    // Centred on each cell: 4 tiles of T px.
    expect(columns.map((label) => label.x)).toEqual([2 * T, 6 * T, 10 * T, 14 * T]);
    expect(rows.map((label) => label.y)).toEqual([2 * T, 6 * T, 9 * T]);
  });

  it('centres a label on the part of its cell that is visible, while panned and zoomed', () => {
    const view: CameraView = { scrollX: 150, scrollY: 0, zoom: 2 };
    const { columns } = edgeLabels(view, bounds, 4);
    // Cell A spans world 0–192; from 150 on is visible, which is screen 0–84.
    expect(columns[0]).toMatchObject({ text: 'A', x: 42 });
    // Cell D spans world 576–768; the view ends at world 150 + 384 = 534, so it is gone.
    expect(columns.map((label) => label.text)).toEqual(['A', 'B', 'C']);
  });

  it('drops a cell with almost none of it on screen', () => {
    const view: CameraView = { scrollX: 4 * T - 1, scrollY: 0, zoom: 1 };
    expect(edgeLabels(view, bounds, 4).columns[0]!.text).toBe('B');
  });

  it('keeps labels inside the map when it is smaller than the screen (centred with a margin)', () => {
    const wide: CameraBounds = { ...bounds, viewport: { width: 32 * T, height: 10 * T } };
    const view: CameraView = { scrollX: -8 * T, scrollY: 0, zoom: 1 };
    const { columns } = edgeLabels(view, wide, 4);
    expect(columns[0]!.x).toBe(2 * T + 8 * T);
  });

  it('stops the last cell at the map edge when the cell size does not divide the map', () => {
    const odd: CameraBounds = { ...bounds, world: { width: 6 * T, height: 10 * T } };
    const { columns } = edgeLabels(fit, odd, 4);
    expect(columns.map((label) => label.text)).toEqual(['A', 'B']);
    expect(columns[1]!.x).toBe(5 * T);
  });
});

import type { Tile } from '../sim/map';
import { MAP_GRID, TILE_PX } from '../data/display';
import type { CameraBounds, CameraView } from './camera';

// The tactical map grid (#400): cells of N×N tiles, lettered along the top and numbered down the left, Arma-style,
// so a place can be named ("Grid C4"). Pure, so the briefing and the keyboard cursor use the same names.

/** The letters for column `index` (0-based): A…Z, then AA, AB… */
export function columnLetters(index: number): string {
  let name = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) name = String.fromCharCode(65 + (n % 26)) + name;
  return name;
}

/** The grid reference of the cell holding `tile`, such as "C4": the column letters, then the row number from 1. */
export function gridLabel({ col, row }: Tile, cellTiles: number = MAP_GRID.cellTiles): string {
  return `${columnLetters(Math.floor(col / cellTiles))}${Math.floor(row / cellTiles) + 1}`;
}

/** A label to draw at a screen pixel, centred there. */
export interface EdgeLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The labels for the visible edges: `columns` along the top (their `x`, with `y` 0) and `rows` down the left (their
 * `y`, with `x` 0). Each is centred on the part of its cell that is on screen, so it follows a pan and zoom, and a cell
 * with less than `minVisiblePx` on screen gets none.
 */
export function edgeLabels(
  view: CameraView,
  { viewport, world }: CameraBounds,
  cellTiles: number = MAP_GRID.cellTiles,
): { columns: EdgeLabel[]; rows: EdgeLabel[] } {
  const cellPx = cellTiles * TILE_PX;
  const span = (index: number, size: number, scroll: number, screenSize: number) => {
    const start = (index * cellPx - scroll) * view.zoom;
    const end = (Math.min((index + 1) * cellPx, size) - scroll) * view.zoom;
    const lo = Math.max(start, 0);
    const hi = Math.min(end, screenSize);
    return hi - lo >= MAP_GRID.label.minVisiblePx ? (lo + hi) / 2 : undefined;
  };
  const columns: EdgeLabel[] = [];
  for (let c = 0; c * cellPx < world.width; c++) {
    const x = span(c, world.width, view.scrollX, viewport.width);
    if (x !== undefined) columns.push({ text: columnLetters(c), x, y: 0 });
  }
  const rows: EdgeLabel[] = [];
  for (let r = 0; r * cellPx < world.height; r++) {
    const y = span(r, world.height, view.scrollY, viewport.height);
    if (y !== undefined) rows.push({ text: String(r + 1), x: 0, y });
  }
  return { columns, rows };
}

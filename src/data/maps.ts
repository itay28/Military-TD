import type { MapData } from '../sim/map';
import { GRID_COLS, GRID_ROWS } from './grid';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. */
export const MVP_MAP: MapData = {
  id: 'mvp',
  cols: GRID_COLS,
  rows: GRID_ROWS,
  waypoints: [
    { col: 0, row: 2 },
    { col: 3, row: 2 },
    { col: 3, row: 7 },
    { col: 8, row: 7 },
    { col: 8, row: 2 },
    { col: 12, row: 2 },
    { col: 12, row: 6 },
    { col: 15, row: 6 },
  ],
};

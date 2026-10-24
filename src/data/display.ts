import { GRID_COLS, GRID_ROWS } from './grid';

/** Size of one tile in pixels. Only Scenes convert tiles to pixels. */
export const TILE_PX = 48;

export const CANVAS_WIDTH = GRID_COLS * TILE_PX;
export const CANVAS_HEIGHT = GRID_ROWS * TILE_PX;

/** How the map is drawn with shapes (before the v0.4 tileset). */
export const MAP_STYLE = {
  path: 0xc2a46b, // sand
  buildable: 0x5b6b3a, // olive
  grid: { color: 0x000000, alpha: 0.15, width: 1 },
} as const;

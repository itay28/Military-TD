import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE_PX } from './display';
import { GRID_COLS, GRID_ROWS } from './grid';

describe('display', () => {
  it('canvas is 768×480 from a 16×10 grid of 48 px tiles', () => {
    expect([GRID_COLS, GRID_ROWS, TILE_PX]).toEqual([16, 10, 48]);
    expect([CANVAS_WIDTH, CANVAS_HEIGHT]).toEqual([768, 480]);
  });
});

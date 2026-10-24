import { describe, expect, it } from 'vitest';
import { tileCenter } from '../sim/map';
import { pixelToTile, tileTopLeft, toPixels } from './coords';

describe('coords', () => {
  it('converts a tile position to pixels: the center of tile (0, 0) is (24, 24)', () => {
    expect(toPixels({ x: 0.5, y: 0.5 })).toEqual({ x: 24, y: 24 });
  });

  it('gives the top-left pixel of a tile', () => {
    expect(tileTopLeft({ col: 2, row: 1 })).toEqual({ x: 96, y: 48 });
  });

  it('maps a pixel to the tile under it, flooring at tile edges', () => {
    expect(pixelToTile({ x: 47.9, y: 0 })).toEqual({ col: 0, row: 0 });
    expect(pixelToTile({ x: 48, y: 0 })).toEqual({ col: 1, row: 0 });
    expect(pixelToTile({ x: 100, y: 479 })).toEqual({ col: 2, row: 9 });
  });

  it("round-trips a tile through its center's pixels", () => {
    const tile = { col: 7, row: 3 };
    expect(pixelToTile(toPixels(tileCenter(tile)))).toEqual(tile);
  });
});

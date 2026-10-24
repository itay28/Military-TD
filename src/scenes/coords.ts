import { TILE_PX } from '../data/display';
import type { Position, Tile } from '../sim/map';

/** A point on the canvas, in pixels. */
export interface Pixel {
  readonly x: number;
  readonly y: number;
}

// Tile↔pixel conversion for scenes. The sim works in tiles only (ADR-0002); scenes convert through these.

export function toPixels({ x, y }: Position): Pixel {
  return { x: x * TILE_PX, y: y * TILE_PX };
}

export function tileTopLeft({ col, row }: Tile): Pixel {
  return { x: col * TILE_PX, y: row * TILE_PX };
}

/** The tile under a pixel. It may be out of bounds; the map's inBounds decides. */
export function pixelToTile({ x, y }: Pixel): Tile {
  return { col: Math.floor(x / TILE_PX), row: Math.floor(y / TILE_PX) };
}

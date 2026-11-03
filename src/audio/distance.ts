import type { Position } from '../sim/map';

/** How a sound fades with its distance from the camera's centre, in tiles. */
export interface Falloff {
  /** Full volume up to here. */
  readonly nearTiles: number;
  /** The quietest from here on. */
  readonly farTiles: number;
  /** The volume at `farTiles` and beyond (0–1): far fights stay audible, just quieter. */
  readonly minVolume: number;
}

/** A sound's volume at `distanceTiles` from the camera's centre: 1 when near, falling linearly to `minVolume` far away. */
export function distanceVolume(distanceTiles: number, { nearTiles, farTiles, minVolume }: Falloff): number {
  const t = Math.min(1, Math.max(0, (distanceTiles - nearTiles) / (farTiles - nearTiles)));
  return 1 - t * (1 - minVolume);
}

/** What `viewCenter` needs of the camera: its scroll and zoom, and its size in screen px (origin at the top-left). */
export interface CameraLike {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** The world point at the middle of the camera's view, in tiles (`tilePx` world px per tile). */
export function viewCenter(camera: CameraLike, tilePx: number): Position {
  return {
    x: (camera.scrollX + camera.width / 2 / camera.zoom) / tilePx,
    y: (camera.scrollY + camera.height / 2 / camera.zoom) / tilePx,
  };
}

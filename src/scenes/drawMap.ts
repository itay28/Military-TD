import { MAP_COLORS, TILE_PX } from '../data/display';
import type { GameMap } from '../sim/map';
import { tileTopLeft } from './coords';

/** The part of Phaser's Graphics that drawMap uses, so tests can pass a recording fake. */
export interface MapPainter {
  fillStyle(color: number, alpha?: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  lineStyle(lineWidth: number, color: number, alpha?: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/** Fills each tile by kind (Path or buildable), then draws faint grid lines on every tile edge. */
export function drawMap(g: MapPainter, map: GameMap): void {
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const tile = { col, row };
      const { x, y } = tileTopLeft(tile);
      g.fillStyle(map.isPath(tile) ? MAP_COLORS.path : MAP_COLORS.buildable);
      g.fillRect(x, y, TILE_PX, TILE_PX);
    }
  }

  const width = map.cols * TILE_PX;
  const height = map.rows * TILE_PX;
  g.lineStyle(1, MAP_COLORS.grid, MAP_COLORS.gridAlpha);
  for (let col = 0; col <= map.cols; col++) g.lineBetween(col * TILE_PX, 0, col * TILE_PX, height);
  for (let row = 0; row <= map.rows; row++) g.lineBetween(0, row * TILE_PX, width, row * TILE_PX);
}

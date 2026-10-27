import { MAP_STYLE, TILE_PX } from '../data/display';
import type { TileType } from '../data/sprites';
import type { GameMap, Tile } from '../sim/map';
import { tileTopLeft } from './coords';

/** The part of Phaser's Graphics that drawMap uses, so tests can pass a recording fake. */
export interface MapPainter {
  fillStyle(color: number, alpha?: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  lineStyle(lineWidth: number, color: number, alpha?: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/** Fills each tile by kind (Path, buildable or blocked), then draws faint grid lines on every tile edge. */
export function drawMap(painter: MapPainter, map: GameMap): void {
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const tile = { col, row };
      const { x, y } = tileTopLeft(tile);
      painter.fillStyle(MAP_STYLE[tileType(map, tile)]);
      painter.fillRect(x, y, TILE_PX, TILE_PX);
    }
  }
  drawGrid(painter, map);
}

/** What `tile` is drawn as: Path, buildable, or blocked (neither). */
export function tileType(map: GameMap, tile: Tile): TileType {
  if (map.isPath(tile)) return 'path';
  return map.isBuildable(tile) ? 'buildable' : 'blocked';
}

/** Faint grid lines on every tile edge. Drawn over the tile sprites too. */
export function drawGrid(painter: MapPainter, map: GameMap): void {
  // The bottom-right corner of the map is the top-left of the tile just past it.
  const { x: width, y: height } = tileTopLeft({ col: map.cols, row: map.rows });
  const { color, alpha, width: lineWidth } = MAP_STYLE.grid;
  painter.lineStyle(lineWidth, color, alpha);
  for (let col = 0; col <= map.cols; col++) {
    const { x } = tileTopLeft({ col, row: 0 });
    painter.lineBetween(x, 0, x, height);
  }
  for (let row = 0; row <= map.rows; row++) {
    const { y } = tileTopLeft({ col: 0, row });
    painter.lineBetween(0, y, width, y);
  }
}

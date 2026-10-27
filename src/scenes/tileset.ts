import { MAP_STYLE } from '../data/display';
import { DECORATION_FRAMES, GROUND_FRAMES, ROAD_FRAMES, type RoadShape } from '../data/sprites';
import { tileKey, type GameMap, type Tile } from '../sim/map';
import { createRng } from '../sim/rng';
import { tileType } from './drawMap';

/** What one map tile is drawn with: a ground frame (grass or road), its tint if any, and a decoration on top. */
export interface TileArt {
  readonly tile: Tile;
  readonly ground: string;
  readonly tint?: number;
  readonly decoration: string | null;
}

/** Every frame `tileArt` can draw, so the scene can check the atlas has them all before using it. */
export const TILESET_FRAMES: readonly string[] = [
  ...Object.values(ROAD_FRAMES),
  ...Object.values(GROUND_FRAMES),
  ...DECORATION_FRAMES,
];

type Side = 'north' | 'east' | 'south' | 'west';

const STEP: Record<Side, Tile> = {
  north: { col: 0, row: -1 },
  east: { col: 1, row: 0 },
  south: { col: 0, row: 1 },
  west: { col: -1, row: 0 },
};
const SIDES = Object.keys(STEP) as Side[];
const OPPOSITE: Record<Side, Side> = { north: 'south', east: 'west', south: 'north', west: 'east' };

const neighbour = ({ col, row }: Tile, side: Side): Tile => ({ col: col + STEP[side].col, row: row + STEP[side].row });

/** The side of `from` that `to`, an orthogonal neighbour, is on. */
function sideTowards(from: Tile, to: Tile): Side {
  return SIDES.find((side) => {
    const { col, row } = neighbour(from, side);
    return col === to.col && row === to.row;
  })!;
}

/**
 * The side a Path end joins off the grid: straight on from its one Path neighbour when that leaves the grid,
 * otherwise the grid edge it's on (validation puts both ends on an edge).
 */
function offGridSide(map: GameMap, end: Tile, inner: Tile): Side {
  const straight = OPPOSITE[sideTowards(end, inner)];
  if (!map.inBounds(neighbour(end, straight))) return straight;
  return SIDES.find((side) => !map.inBounds(neighbour(end, side)))!;
}

/** The road shape of the Path tile at `index` in walking order, from the tiles before and after it on the Path. */
export function roadShape(map: GameMap, index: number): RoadShape {
  const path = map.pathTiles;
  const tile = path[index]!;
  const before = index > 0 ? sideTowards(tile, path[index - 1]!) : offGridSide(map, tile, path[1]!);
  const after =
    index < path.length - 1 ? sideTowards(tile, path[index + 1]!) : offGridSide(map, tile, path[index - 1]!);
  const joins = new Set([before, after]);
  if (joins.has('east') && joins.has('west')) return 'eastWest';
  if (joins.has('north') && joins.has('south')) return 'northSouth';
  return `${joins.has('north') ? 'north' : 'south'}${joins.has('east') ? 'East' : 'West'}`;
}

/** A whole-number hash of the map id (FNV-1a), so each map seeds its own decorations. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/**
 * The decoration on `tile`: a tree, bush or rock on a blocked tile (non-buildable, off the Path), else null. Picked
 * from a seed made of the map id and the tile, so the same map always looks the same.
 */
export function decorationFor(map: GameMap, tile: Tile): string | null {
  if (tileType(map, tile) !== 'blocked') return null;
  const seed = hashId(map.id) ^ Math.imul(tile.row * map.cols + tile.col + 1, 0x9e3779b1);
  return DECORATION_FRAMES[createRng(seed).int(0, DECORATION_FRAMES.length - 1)]!;
}

/** What each tile of `map` is drawn with, row by row: road on the Path, grass elsewhere, decorations on blocked tiles. */
export function tileArt(map: GameMap): TileArt[] {
  const roads = new Map(map.pathTiles.map((tile, i) => [tileKey(tile), ROAD_FRAMES[roadShape(map, i)]]));
  const art: TileArt[] = [];
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const tile = { col, row };
      const road = roads.get(tileKey(tile));
      if (road !== undefined) art.push({ tile, ground: road, decoration: null });
      else if (tileType(map, tile) === 'buildable')
        art.push({ tile, ground: GROUND_FRAMES.buildable, decoration: null });
      else {
        const decoration = decorationFor(map, tile);
        art.push({ tile, ground: GROUND_FRAMES.blocked, tint: MAP_STYLE.blockedTint, decoration });
      }
    }
  }
  return art;
}

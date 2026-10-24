export interface Tile {
  readonly col: number;
  readonly row: number;
}

/** A point in tiles (floats). (0.5, 0.5) is the center of tile (0, 0). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** A map as authored: grid size plus the Path as ordered waypoint tiles. */
export interface MapData {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
  readonly waypoints: readonly Tile[];
}

export interface GameMap extends MapData {
  /** Every Path tile in walking order, spawn to exit, each once. */
  readonly pathTiles: readonly Tile[];
  /** Waypoints as tile-center positions, for enemy movement. */
  readonly waypointPositions: readonly Position[];
  inBounds(tile: Tile): boolean;
  isPath(tile: Tile): boolean;
  /** In bounds and not Path. Tower occupancy is game state, checked when placing. */
  isBuildable(tile: Tile): boolean;
}

export class InvalidMapError extends Error {
  override name = 'InvalidMapError';
}

/** Validates the map and derives its Path tiles; throws InvalidMapError when it is malformed. */
export function createMap(data: MapData): GameMap {
  const { cols, rows, waypoints } = data;
  const inBounds = ({ col, row }: Tile) =>
    Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < cols && row >= 0 && row < rows;
  validateWaypoints(data, inBounds);
  const pathTiles = expandPath(data);
  const pathKeys = new Set(pathTiles.map(tileKey));
  const isPath = (tile: Tile) => pathKeys.has(tileKey(tile));
  return {
    ...data,
    pathTiles,
    waypointPositions: waypoints.map(tileCenter),
    inBounds,
    isPath,
    isBuildable: (tile) => inBounds(tile) && !isPath(tile),
  };
}

export function tileCenter({ col, row }: Tile): Position {
  return { x: col + 0.5, y: row + 0.5 };
}

function fail(map: MapData, reason: string): never {
  throw new InvalidMapError(`Map "${map.id}": ${reason}`);
}

function validateWaypoints(map: MapData, inBounds: (tile: Tile) => boolean): void {
  const { cols, rows, waypoints } = map;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1)
    fail(map, `grid size ${cols}×${rows} must be whole, positive tiles`);
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  if (!first || !last || waypoints.length < 2) fail(map, 'the Path needs at least two waypoints');

  waypoints.forEach((tile, i) => {
    if (!inBounds(tile)) fail(map, `waypoint ${i} (${tileKey(tile)}) is outside the ${cols}×${rows} grid`);
    const prev = waypoints[i - 1];
    if (!prev) return;
    if (tileKey(prev) === tileKey(tile))
      fail(map, `waypoint ${i} (${tileKey(tile)}) repeats the previous one (zero-length segment)`);
    if (prev.col !== tile.col && prev.row !== tile.row)
      fail(map, `segment ${i - 1}→${i} (${tileKey(prev)} to ${tileKey(tile)}) is not orthogonal`);
  });

  const onEdge = ({ col, row }: Tile) => col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
  if (!onEdge(first)) fail(map, `the Path must start on the grid edge, not at ${tileKey(first)}`);
  if (!onEdge(last)) fail(map, `the Path must end on the grid edge, not at ${tileKey(last)}`);
}

/** Expands validated waypoints into Path tiles; throws if the Path revisits a tile. */
function expandPath(map: MapData): Tile[] {
  const { waypoints } = map;
  const tiles: Tile[] = [];
  const seen = new Set<string>();
  const visit = (tile: Tile) => {
    const k = tileKey(tile);
    if (seen.has(k)) fail(map, `the Path revisits tile ${k}`);
    seen.add(k);
    tiles.push(tile);
  };
  waypoints.forEach((to, i) => {
    const from = waypoints[i - 1];
    if (!from) {
      visit(to);
      return;
    }
    const dc = Math.sign(to.col - from.col);
    const dr = Math.sign(to.row - from.row);
    for (let col = from.col + dc, row = from.row + dr; ; col += dc, row += dr) {
      visit({ col, row });
      if (col === to.col && row === to.row) break;
    }
  });
  return tiles;
}

/** A tile's string id, `"col,row"`, for sets and messages. */
const tileKey = ({ col, row }: Tile) => `${col},${row}`;

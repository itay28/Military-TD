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

export interface GameMap {
  readonly id: string;
  readonly cols: number;
  readonly rows: number;
  readonly waypoints: readonly Tile[];
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
  const { id, cols, rows, waypoints } = data;
  const inBounds = ({ col, row }: Tile) =>
    Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < cols && row >= 0 && row < rows;
  validatePath(data, inBounds);
  const pathTiles = expandPath(waypoints);
  const pathKeys = new Set(pathTiles.map(key));
  const isPath = (tile: Tile) => pathKeys.has(key(tile));
  return {
    id,
    cols,
    rows,
    waypoints,
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

const key = ({ col, row }: Tile) => `${col},${row}`;

function validatePath({ id, cols, rows, waypoints }: MapData, inBounds: (tile: Tile) => boolean): void {
  const fail = (reason: string): never => {
    throw new InvalidMapError(`Map "${id}": ${reason}`);
  };
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  if (!first || !last || waypoints.length < 2) fail('the Path needs at least two waypoints');

  waypoints.forEach((tile, i) => {
    if (!inBounds(tile)) fail(`waypoint ${i} (${key(tile)}) is outside the ${cols}×${rows} grid`);
    const prev = waypoints[i - 1];
    if (!prev) return;
    if (prev.col === tile.col && prev.row === tile.row)
      fail(`waypoint ${i} (${key(tile)}) repeats the previous one (zero-length segment)`);
    if (prev.col !== tile.col && prev.row !== tile.row)
      fail(`segment ${i - 1}→${i} (${key(prev)} to ${key(tile)}) is not orthogonal`);
  });

  const onEdge = ({ col, row }: Tile) => col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
  if (first && !onEdge(first)) fail(`the Path must start on the grid edge, not at ${key(first)}`);
  if (last && !onEdge(last)) fail(`the Path must end on the grid edge, not at ${key(last)}`);
}

function expandPath(waypoints: readonly Tile[]): Tile[] {
  const tiles: Tile[] = [];
  waypoints.forEach((to, i) => {
    const from = waypoints[i - 1];
    if (!from) {
      tiles.push(to);
      return;
    }
    const dc = Math.sign(to.col - from.col);
    const dr = Math.sign(to.row - from.row);
    for (let col = from.col + dc, row = from.row + dr; ; col += dc, row += dr) {
      tiles.push({ col, row });
      if (col === to.col && row === to.row) break;
    }
  });
  return tiles;
}

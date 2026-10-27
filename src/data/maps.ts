import type { MapData } from '../sim/map';
import { GRID_COLS, GRID_ROWS } from './grid';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. */
export const MVP_MAP: MapData = {
  id: 'mvp',
  cols: GRID_COLS,
  rows: GRID_ROWS,
  waypoints: [
    { col: 0, row: 2 },
    { col: 3, row: 2 },
    { col: 3, row: 7 },
    { col: 8, row: 7 },
    { col: 8, row: 2 },
    { col: 12, row: 2 },
    { col: 12, row: 6 },
    { col: 15, row: 6 },
  ],
};

/** The fewest buildable tiles off the Path a map may have, so a full defense still leaves choices (ADR-0006). */
export const MIN_BUILDABLE_TILES = 40;

/** A map the player can pick on the Level select: its id, the name shown, and its data. */
export interface MapEntry {
  readonly id: string;
  readonly name: string;
  readonly data: MapData;
}

/** Every map, in Level select order. A new map is a new entry here. */
export const MAPS: readonly MapEntry[] = [{ id: MVP_MAP.id, name: 'Training Ground', data: MVP_MAP }];

/** The map with this id; throws for an unknown one. */
export function mapById(id: string): MapEntry {
  const entry = MAPS.find((map) => map.id === id);
  if (!entry) throw new Error(`No map "${id}". There are: ${MAPS.map((map) => map.id).join(', ')}`);
  return entry;
}

import type { MapData } from '../sim/map';
import { importTiledMap } from '../sim/tiled';
import trainingGround from '../../maps/01-training-ground.tmj?raw';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. Built in `maps/` (ADR-0006). */
export const MVP_MAP: MapData = importTiledMap('mvp', JSON.parse(trainingGround));

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

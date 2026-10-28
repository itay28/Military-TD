import type { MapData } from '../sim/map';
import { importTiledMap } from '../sim/tiled';
import type { WaveData } from '../sim/waves';
import { SWITCHBACK_WAVES, WAVES } from './waves';
import trainingGround from '../../maps/01-training-ground.tmj?raw';
import switchback from '../../maps/02-switchback.tmj?raw';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. Built in `maps/` (ADR-0006). */
export const MVP_MAP: MapData = importTiledMap('mvp', JSON.parse(trainingGround));

/** Enters on the top edge and winds down an S-curve to the bottom edge. */
export const SWITCHBACK_MAP: MapData = importTiledMap('switchback', JSON.parse(switchback));

/** A map the player can pick on the Level select: its id, the name shown, its data, and the waves played on it. */
export interface MapEntry {
  readonly id: string;
  readonly name: string;
  readonly data: MapData;
  readonly waves: readonly WaveData[];
}

/** Every map, in Level select order. A new map is a new entry here. */
export const MAPS: readonly MapEntry[] = [
  { id: MVP_MAP.id, name: 'Training Ground', data: MVP_MAP, waves: WAVES },
  { id: SWITCHBACK_MAP.id, name: 'Switchback', data: SWITCHBACK_MAP, waves: SWITCHBACK_WAVES },
];

/** The map with this id; throws for an unknown one. */
export function mapById(id: string): MapEntry {
  const entry = MAPS.find((map) => map.id === id);
  if (!entry) throw new Error(`No map "${id}". There are: ${MAPS.map((map) => map.id).join(', ')}`);
  return entry;
}

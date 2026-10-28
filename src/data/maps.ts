import type { MapData } from '../sim/map';
import { importTiledMap } from '../sim/tiled';
import type { WaveData } from '../sim/waves';
import { HAIRPIN_WAVES, SERPENTINE_WAVES, SWITCHBACK_WAVES, WAVES } from './waves';
import trainingGround from '../../maps/01-training-ground.tmj?raw';
import switchback from '../../maps/02-switchback.tmj?raw';
import serpentine from '../../maps/03-serpentine.tmj?raw';
import hairpin from '../../maps/04-hairpin.tmj?raw';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. Built in `maps/` (ADR-0006). */
export const MVP_MAP: MapData = importTiledMap('mvp', JSON.parse(trainingGround));

/** Enters on the top edge and winds down an S-curve to the bottom edge. */
export const SWITCHBACK_MAP: MapData = importTiledMap('switchback', JSON.parse(switchback));

/** The long one: enters on the top edge and snakes down and up through five columns to the bottom edge. */
export const SERPENTINE_MAP: MapData = importTiledMap('serpentine', JSON.parse(serpentine));

/** Enters on the left, runs deep into the map and doubles back two rows lower, so towers between cover both. */
export const HAIRPIN_MAP: MapData = importTiledMap('hairpin', JSON.parse(hairpin));

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
  { id: SERPENTINE_MAP.id, name: 'Serpentine', data: SERPENTINE_MAP, waves: SERPENTINE_WAVES },
  { id: HAIRPIN_MAP.id, name: 'Hairpin', data: HAIRPIN_MAP, waves: HAIRPIN_WAVES },
];

/** The map with this id; throws for an unknown one. */
export function mapById(id: string): MapEntry {
  const entry = MAPS.find((map) => map.id === id);
  if (!entry) throw new Error(`No map "${id}". There are: ${MAPS.map((map) => map.id).join(', ')}`);
  return entry;
}

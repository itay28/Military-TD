import type { Faction } from '../sim/factions';
import { importTiledMap, type TiledMapData } from '../sim/tiled';
import type { WaveData } from '../sim/waves';
import { HAIRPIN_WAVES, SERPENTINE_WAVES, SWITCHBACK_WAVES, WAVES } from './waves';
import trainingGround from '../../maps/01-training-ground.tmj?raw';
import switchback from '../../maps/02-switchback.tmj?raw';
import serpentine from '../../maps/03-serpentine.tmj?raw';
import hairpin from '../../maps/04-hairpin.tmj?raw';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. Built in `maps/` (ADR-0006). */
export const MVP_MAP: TiledMapData = importTiledMap('mvp', JSON.parse(trainingGround));

/** Enters on the top edge and winds down an S-curve to the bottom edge. */
export const SWITCHBACK_MAP: TiledMapData = importTiledMap('switchback', JSON.parse(switchback));

/** The long one: enters on the top edge and snakes down and up through five columns to the bottom edge. */
export const SERPENTINE_MAP: TiledMapData = importTiledMap('serpentine', JSON.parse(serpentine));

/** Enters on the left, runs deep into the map and doubles back two rows lower, so towers between cover both. */
export const HAIRPIN_MAP: TiledMapData = importTiledMap('hairpin', JSON.parse(hairpin));

/** A map the player can pick on the Level select: its id, the name shown, its data, its Factions (ADR-0009), and the waves played on it. */
export interface MapEntry {
  readonly id: string;
  readonly name: string;
  readonly data: TiledMapData;
  readonly waves: readonly WaveData[];
  /** Whose enemies walk the Path: picks enemy sprites. */
  readonly attacker: Faction;
  /** Whose towers the player builds: picks tower sprites. */
  readonly defender: Faction;
}

const entry = (name: string, data: TiledMapData, waves: readonly WaveData[]): MapEntry => ({
  id: data.id,
  name,
  data,
  waves,
  attacker: data.attacker,
  defender: data.defender,
});

/** Every map, in Level select order. A new map is a new entry here. */
export const MAPS: readonly MapEntry[] = [
  entry('Training Ground', MVP_MAP, WAVES),
  entry('Switchback', SWITCHBACK_MAP, SWITCHBACK_WAVES),
  entry('Serpentine', SERPENTINE_MAP, SERPENTINE_WAVES),
  entry('Hairpin', HAIRPIN_MAP, HAIRPIN_WAVES),
];

/** The map with this id; throws for an unknown one. */
export function mapById(id: string): MapEntry {
  const entry = MAPS.find((map) => map.id === id);
  if (!entry) throw new Error(`No map "${id}". There are: ${MAPS.map((map) => map.id).join(', ')}`);
  return entry;
}

/** The waves played on this map: its registry entry's schedule, or `WAVES` for a map outside the registry (test maps). */
export function wavesForMap(id: string): readonly WaveData[] {
  return MAPS.find((map) => map.id === id)?.waves ?? WAVES;
}

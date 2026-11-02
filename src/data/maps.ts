import type { Faction } from '../sim/factions';
import { importTiledMap, type TiledMapData } from '../sim/tiled';
import type { WaveData } from '../sim/waves';
import { SWITCHBACK_WAVES, WAVES } from './waves';
import trainingGround from '../../maps/01-training-ground.tmj?raw';
import switchback from '../../maps/02-switchback.tmj?raw';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. Built in `maps/` (ADR-0006). */
export const MVP_MAP: TiledMapData = importTiledMap('mvp', JSON.parse(trainingGround));

/** Enters on the top edge and winds down an S-curve to the bottom edge. */
export const SWITCHBACK_MAP: TiledMapData = importTiledMap('switchback', JSON.parse(switchback));

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

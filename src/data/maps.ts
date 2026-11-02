import type { Faction } from '../sim/factions';
import { importTiledMap, type TiledMapData } from '../sim/tiled';
import trainingGround from '../../maps/01-training-ground.tmj?raw';

/** The MVP map: enters on the left edge, snakes through the middle, exits on the right edge. Built in `maps/` (ADR-0006). */
export const MVP_MAP: TiledMapData = importTiledMap('mvp', JSON.parse(trainingGround));

/** A map the player can pick on the Level select: its id, the name shown, its data, and its Factions (ADR-0009). */
export interface MapEntry {
  readonly id: string;
  readonly name: string;
  readonly data: TiledMapData;
  /** Whose enemies walk the Path: picks enemy sprites. */
  readonly attacker: Faction;
  /** Whose towers the player builds: picks tower sprites. */
  readonly defender: Faction;
}

const entry = (name: string, data: TiledMapData): MapEntry => ({
  id: data.id,
  name,
  data,
  attacker: data.attacker,
  defender: data.defender,
});

/** Every map, in Level select order. A new map is a new entry here. */
export const MAPS: readonly MapEntry[] = [entry('Training Ground', MVP_MAP)];

/** The map with this id; throws for an unknown one. */
export function mapById(id: string): MapEntry {
  const entry = MAPS.find((map) => map.id === id);
  if (!entry) throw new Error(`No map "${id}". There are: ${MAPS.map((map) => map.id).join(', ')}`);
  return entry;
}

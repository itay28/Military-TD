import type { Faction } from '../sim/factions';
import { importTiledMap, type TiledMapData } from '../sim/tiled';
import trainingGround from '../../maps/01-training-ground.tmj?raw';

/** Every painted ground image (`scripts/naip-map.py`, #312) as a URL Vite serves, keyed by path from this module. */
const GROUND_IMAGES = import.meta.glob<string>('../../assets/naip-maps/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** A map's `ground-image` path, which is relative to `maps/`, as a key of GROUND_IMAGES (relative to this module). */
export function groundImagePath(image: string): string {
  const parts: string[] = ['..', '..', 'maps'];
  for (const part of image.split('/')) {
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/** The texture key the Boot scene loads a map's ground image under. */
export const groundTextureKey = (mapId: string): string => `ground:${mapId}`;

/** The URL of the map's ground image; throws when the map names an image that isn't in `assets/naip-maps/`. */
function groundImageUrl({ id, groundImage }: TiledMapData): string | undefined {
  if (groundImage === undefined) return undefined;
  const url = GROUND_IMAGES[groundImagePath(groundImage)];
  if (url === undefined) throw new Error(`Map "${id}": its ground image ${groundImage} is not in assets/naip-maps/`);
  return url;
}

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
  /** The painted ground image drawn under the grid, or undefined to draw the tileset (#312). */
  readonly groundImageUrl: string | undefined;
}

const entry = (name: string, data: TiledMapData): MapEntry => ({
  id: data.id,
  name,
  data,
  attacker: data.attacker,
  defender: data.defender,
  groundImageUrl: groundImageUrl(data),
});

/** Every map, in Level select order. A new map is a new entry here. */
export const MAPS: readonly MapEntry[] = [entry('Training Ground', MVP_MAP)];

/** The map with this id; throws for an unknown one. */
export function mapById(id: string): MapEntry {
  const entry = MAPS.find((map) => map.id === id);
  if (!entry) throw new Error(`No map "${id}". There are: ${MAPS.map((map) => map.id).join(', ')}`);
  return entry;
}

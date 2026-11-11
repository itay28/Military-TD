import type { Faction } from '../sim/factions';
import { importTiledMap, type TiledMapData } from '../sim/tiled';
import type { WaveData } from '../sim/waves';
import { HAIRPIN_WAVES, SERPENTINE_WAVES, SWITCHBACK_WAVES, WAVES } from './waves';
import trainingGround from '../../maps/01-training-ground.tmj?raw';
import switchback from '../../maps/02-switchback.tmj?raw';
import serpentine from '../../maps/03-serpentine.tmj?raw';
import hairpin from '../../maps/04-hairpin.tmj?raw';

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
  /** The painted ground image drawn under the grid, or undefined to draw the tileset (#312). */
  readonly groundImageUrl: string | undefined;
  /** What the Operations screen's briefing says before Deploy (#401). */
  readonly briefing: MapBriefing;
}

/** A map's briefing text (#401): no wave contents, which are Sniper intel (#353). */
export interface MapBriefing {
  /** "Operation <Name>", the briefing's heading. */
  readonly operation: string;
  /** One or two sentences: who is coming and what to hold. */
  readonly situation: string;
  /** One line on the ground and the road. */
  readonly terrain: string;
}

const entry = (name: string, data: TiledMapData, waves: readonly WaveData[], briefing: MapBriefing): MapEntry => ({
  id: data.id,
  name,
  data,
  waves,
  briefing,
  attacker: data.attacker,
  defender: data.defender,
  groundImageUrl: groundImageUrl(data),
});

/** Every map, in Level select order. A new map is a new entry here. */
export const MAPS: readonly MapEntry[] = [
  entry('Training Ground', MVP_MAP, WAVES, {
    operation: 'Operation First Light',
    situation:
      'Enemy forces are probing the farmland from the west. Hold the road before they reach HQ on the east edge.',
    terrain: 'Open fields cut by one winding dirt road, with little cover.',
  }),
  entry('Switchback', SWITCHBACK_MAP, SWITCHBACK_WAVES, {
    operation: 'Operation Hollow Ridge',
    situation:
      'Enemy columns are coming down from the northern ridge. Stop them on the switchbacks before they reach HQ in the valley.',
    terrain: 'A road that doubles back down a slope, so the turns bunch traffic up.',
  }),
  entry('Serpentine', SERPENTINE_MAP, SERPENTINE_WAVES, {
    operation: 'Operation Long Watch',
    situation: 'A large enemy force is pushing south toward HQ. Bleed it at every bend of the long road.',
    terrain: 'One road snaking through five bends: long, and every bend can be covered.',
  }),
  entry('Hairpin', HAIRPIN_MAP, HAIRPIN_WAVES, {
    operation: 'Operation Iron Hook',
    situation:
      'The enemy is driving hard down the western road toward HQ. Hold the hook where it turns back on itself.',
    terrain: 'The road runs deep, then doubles back two rows lower; one position covers both legs.',
  }),
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

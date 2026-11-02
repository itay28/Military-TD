import { MIN_BUILDABLE_TILES } from '../data/mapRules';
import { FACTIONS, isFaction, type Faction } from './factions';
import { createMap, InvalidMapError, tileKey, type MapData, type Tile } from './map';

// Tiled map import (ADR-0006): a `.tmj` file → MapData. Pure, so tests and the game share it. Rules never see
// Tiled's format: the `ground` tile layer gives the grid and the buildable tiles (tile property `buildable`), and the
// one polyline on the `path` object layer gives the Path. The map's custom properties `attacker` and `defender` name
// its Factions (ADR-0009), which only the scenes read. An optional `ground-image` image layer names one painted
// ground image for the whole map (#312); only the scenes draw it.

/** Tiled keeps flip and rotation flags in a GID's top bits. */
const GID_FLAGS = 0xf0000000;

type Json = Record<string, unknown>;

/** A map file's data: the sim's MapData plus the Factions on each side, which pick sprites and never touch rules. */
export interface TiledMapData extends MapData {
  readonly attacker: Faction;
  readonly defender: Faction;
  /** The `ground-image` layer's image, relative to the map file; undefined when the map has none. */
  readonly groundImage?: string;
}

/**
 * Converts a parsed Tiled JSON map to MapData and validates it as a playable map: the Path as `createMap` checks it
 * (connected, orthogonal, edge to edge, no revisits) and at least `MIN_BUILDABLE_TILES` buildable tiles off it.
 * Throws InvalidMapError, naming the map and what to fix.
 */
export function importTiledMap(id: string, json: unknown): TiledMapData {
  const fail = (reason: string): never => {
    throw new InvalidMapError(`Map "${id}": ${reason}`);
  };
  if (!isObject(json)) return fail('not a Tiled map (expected a JSON object)');
  if (!Array.isArray(json.layers)) return fail('not a Tiled map ("layers" must be an array)');
  if (json.orientation !== 'orthogonal') return fail(`the map must be orthogonal, not ${String(json.orientation)}`);
  if (json.infinite) return fail('infinite maps are not supported (untick Infinite in Map Properties)');
  const cols = json.width;
  const rows = json.height;
  const tileW = json.tilewidth;
  const tileH = json.tileheight;
  if (typeof cols !== 'number' || typeof rows !== 'number') return fail('the map needs a width and height in tiles');
  if (typeof tileW !== 'number' || tileW <= 0 || tileW !== tileH)
    return fail(`tiles must be square, not ${String(tileW)}×${String(tileH)} px`);

  const attacker = readFaction(json.properties, 'attacker', fail);
  const defender = readFaction(json.properties, 'defender', fail);
  const buildableGids = readTilesets(json.tilesets, tileW, fail);
  const layers = json.layers.filter(isObject);

  const ground = layers.find((layer) => layer.type === 'tilelayer' && layer.name === 'ground');
  if (!ground) return fail('needs a "ground" tile layer');
  if (ground.width !== cols || ground.height !== rows)
    return fail(`the ground layer is ${String(ground.width)}×${String(ground.height)}; the map is ${cols}×${rows}`);
  if (!Array.isArray(ground.data))
    return fail(`the ground layer's data must be CSV (an array of GIDs), not ${String(ground.encoding ?? 'encoded')}`);
  if (ground.data.length !== cols * rows)
    return fail(`the ground layer has ${ground.data.length} tiles; a ${cols}×${rows} map needs ${cols * rows} tiles`);

  const buildable: Tile[] = [];
  ground.data.forEach((raw: unknown, i) => {
    const tile = { col: i % cols, row: Math.floor(i / cols) };
    if (typeof raw !== 'number') return fail(`ground tile ${tileKey(tile)} is not a GID`);
    const gid = (raw & ~GID_FLAGS) >>> 0;
    // GID 0 is Tiled's empty tile: allowed, never buildable.
    if (gid !== 0 && !buildableGids.has(gid))
      return fail(`ground tile ${tileKey(tile)} has GID ${gid}, which no tileset holds`);
    if (buildableGids.get(gid)) buildable.push(tile);
  });

  const pathLayer = layers.find((layer) => layer.type === 'objectgroup' && layer.name === 'path');
  if (!pathLayer) return fail('needs a "path" object layer');
  const polylines = (Array.isArray(pathLayer.objects) ? pathLayer.objects : []).filter(
    (object): object is Json => isObject(object) && Array.isArray(object.polyline),
  );
  if (polylines.length !== 1)
    return fail(`the "path" layer needs exactly one polyline object, found ${polylines.length}`);
  const [line] = polylines as [Json];
  const originX = line.x === undefined ? 0 : line.x;
  const originY = line.y === undefined ? 0 : line.y;
  if (typeof originX !== 'number' || typeof originY !== 'number')
    return fail('the path polyline needs numeric x and y');
  // Each point snaps to the tile it falls in, i.e. to that tile's centre.
  const points = line.polyline as unknown[];
  if (!points.every((p) => isObject(p) && Number.isFinite(p.x) && Number.isFinite(p.y)))
    return fail('every point of the path polyline needs numeric x and y');
  const waypoints = (points as { x: number; y: number }[]).map((point) => ({
    col: Math.floor((originX + point.x) / tileW),
    row: Math.floor((originY + point.y) / tileW),
  }));

  const groundImage = readGroundImage(layers, fail);

  const data: MapData = { id, cols, rows, waypoints, buildable };
  const map = createMap(data);
  const usable = buildable.filter((tile) => !map.isPath(tile)).length;
  if (usable < MIN_BUILDABLE_TILES)
    return fail(`has ${usable} buildable tiles off the Path; a map needs at least ${MIN_BUILDABLE_TILES}`);
  return groundImage === undefined ? { ...data, attacker, defender } : { ...data, attacker, defender, groundImage };
}

/** The image of the `ground-image` image layer, if the map has one; fails when it names no image. */
function readGroundImage(layers: Json[], fail: (reason: string) => never): string | undefined {
  const layer = layers.find((candidate) => candidate.type === 'imagelayer' && candidate.name === 'ground-image');
  if (!layer) return undefined;
  if (typeof layer.image !== 'string' || layer.image === '')
    return fail('the "ground-image" layer needs an image (Layer → Image in Tiled)');
  return layer.image;
}

/** The Faction a map property names; fails when it is missing or not one of FACTIONS. */
function readFaction(properties: unknown, side: 'attacker' | 'defender', fail: (reason: string) => never): Faction {
  const property = (Array.isArray(properties) ? properties.filter(isObject) : []).find(({ name }) => name === side);
  const options = `one of ${FACTIONS.join(', ')}`;
  if (!property) return fail(`needs ${side === 'attacker' ? 'an' : 'a'} "${side}" map property (${options})`);
  if (!isFaction(property.value)) return fail(`${side} "${String(property.value)}" is not a Faction (${options})`);
  return property.value;
}

/** Every GID the embedded tilesets hold, mapped to whether its tile has `buildable: true`. */
function readTilesets(tilesets: unknown, tilePx: number, fail: (reason: string) => never): Map<number, boolean> {
  const gids = new Map<number, boolean>();
  if (!Array.isArray(tilesets)) return gids;
  for (const tileset of tilesets.filter(isObject)) {
    if (typeof tileset.source === 'string')
      return fail(`tileset "${tileset.source}" is external; embed it in the map (Tilesets → Embed Tileset)`);
    const name = String(tileset.name);
    if (tileset.tilewidth !== tilePx || tileset.tileheight !== tilePx)
      return fail(
        `tileset "${name}" has ${String(tileset.tilewidth)}×${String(tileset.tileheight)} px tiles; the map's are ${tilePx}×${tilePx}`,
      );
    const firstGid = Number(tileset.firstgid);
    for (let id = 0; id < Number(tileset.tilecount); id++) gids.set(firstGid + id, false);
    for (const tile of Array.isArray(tileset.tiles) ? tileset.tiles.filter(isObject) : []) {
      const properties = Array.isArray(tile.properties) ? tile.properties.filter(isObject) : [];
      const buildable = properties.some((property) => property.name === 'buildable' && property.value === true);
      gids.set(firstGid + Number(tile.id), buildable);
    }
  }
  return gids;
}

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null;

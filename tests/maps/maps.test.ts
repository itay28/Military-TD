import { isDeepStrictEqual } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAPS, MVP_MAP } from '../../src/data/maps';
import { runScenario } from '../../src/sim/scenario';
import { createMap, tileKey } from '../../src/sim/map';
import { importTiledMap } from '../../src/sim/tiled';
import { BALANCED_ORDER } from '../scenarios/bot-balanced.scenario';
import { buildOrder, fitOrder } from '../scenarios/bots';

// Every map in `maps/` must import cleanly and be winnable by the reference bot (ADR-0006).

const MAPS_DIR = 'maps';

const load = (file: string) => importTiledMap(basename(file, '.tmj'), JSON.parse(readFileSync(file, 'utf8')));

const mapFiles = readdirSync(MAPS_DIR)
  .filter((name) => name.endsWith('.tmj'))
  .map((name) => join(MAPS_DIR, name));

const TRAINING_GROUND = 'maps/01-training-ground.tmj';
const atlas = JSON.parse(readFileSync('assets/atlas/sprites.json', 'utf8')) as { frames: Record<string, unknown> };

describe('01-training-ground.tmj', () => {
  const json = JSON.parse(readFileSync(TRAINING_GROUND, 'utf8'));

  it('is the MVP map: 16×10, the original eight waypoints, and every tile off the Path buildable', () => {
    const map = createMap(load(TRAINING_GROUND));
    expect([map.cols, map.rows]).toEqual([16, 10]);
    expect(map.waypoints).toEqual([
      { col: 0, row: 2 },
      { col: 3, row: 2 },
      { col: 3, row: 7 },
      { col: 8, row: 7 },
      { col: 8, row: 2 },
      { col: 12, row: 2 },
      { col: 12, row: 6 },
      { col: 15, row: 6 },
    ]);
    const tiles = Array.from({ length: map.rows }, (_, row) =>
      Array.from({ length: map.cols }, (_, col) => ({ col, row })),
    ).flat();
    expect(tiles.filter((tile) => map.isBuildable(tile)).map(tileKey)).toEqual(
      tiles.filter((tile) => !map.isPath(tile)).map(tileKey),
    );
  });

  it('draws road tiles on the Path and nowhere else', () => {
    const map = createMap(load(TRAINING_GROUND));
    const tileset = json.tilesets[0] as {
      firstgid: number;
      tiles: { id: number; properties: { name: string; value: string }[] }[];
    };
    const roadGids = tileset.tiles
      .filter((tile) => tile.properties.some((p) => p.name === 'frame' && p.value.includes('road')))
      .map((tile) => tile.id + tileset.firstgid);
    expect(roadGids.length).toBeGreaterThan(0);
    const ground = json.layers.find((layer: { name: string }) => layer.name === 'ground') as { data: number[] };
    ground.data.forEach((gid, index) => {
      const tile = { col: index % map.cols, row: Math.floor(index / map.cols) };
      expect({ tile: tileKey(tile), road: roadGids.includes(gid) }).toEqual({
        tile: tileKey(tile),
        road: map.isPath(tile),
      });
    });
  });

  it('names an atlas frame for every tile of its tileset', () => {
    const tiles = json.tilesets.flatMap((tileset: { tiles: unknown[] }) => tileset.tiles) as {
      properties: { name: string; value: string }[];
    }[];
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      const frame = tile.properties.find((property) => property.name === 'frame')?.value;
      expect(frame).toBeDefined();
      expect(Object.keys(atlas.frames)).toContain(frame);
    }
  });
});

describe('02-switchback.tmj', () => {
  const file = 'maps/02-switchback.tmj';

  it('enters on the top edge and winds down to the bottom edge, unlike the Training Ground', () => {
    const map = createMap(load(file));
    expect([map.cols, map.rows]).toEqual([16, 10]);
    expect(map.waypoints[0]?.row).toBe(0);
    expect(map.waypoints.at(-1)?.row).toBe(map.rows - 1);
    expect(map.waypoints).not.toEqual(createMap(load(TRAINING_GROUND)).waypoints);
  });

  it('draws road tiles on the Path and nowhere else', () => {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    const map = createMap(load(file));
    const roadGids = json.tilesets[0].tiles
      .filter((tile: { properties: { name: string; value: unknown }[] }) =>
        tile.properties.some((p) => p.name === 'frame' && String(p.value).includes('road')),
      )
      .map((tile: { id: number }) => tile.id + json.tilesets[0].firstgid);
    const ground = json.layers.find((layer: { name: string }) => layer.name === 'ground') as { data: number[] };
    ground.data.forEach((gid, index) => {
      const tile = { col: index % map.cols, row: Math.floor(index / map.cols) };
      expect({ tile: tileKey(tile), road: roadGids.includes(gid) }).toEqual({
        tile: tileKey(tile),
        road: map.isPath(tile),
      });
    });
  });

  it('uses the same tileset as the Training Ground', () => {
    const tilesets = (path: string) => JSON.parse(readFileSync(path, 'utf8')).tilesets;
    expect(tilesets(file)).toEqual(tilesets(TRAINING_GROUND));
  });
});

describe('Tiled map files', () => {
  it('the registry serves the Training Ground file as the MVP map', () => {
    expect(MVP_MAP).toEqual({ ...load(TRAINING_GROUND), id: 'mvp' });
  });

  // Registry ids are short names, not file names, so a file matches the entry whose data it is, id aside.
  const entryFor = (file: string) => {
    const map = load(file);
    return MAPS.find((entry) => isDeepStrictEqual({ ...map, id: entry.id }, entry.data));
  };

  it.each(mapFiles)('%s is a map in the registry', (file) => {
    expect(entryFor(file)).toBeDefined();
  });

  it.each(mapFiles)('%s imports and the reference bot wins it with its own waves', (file) => {
    const entry = entryFor(file)!;
    const result = runScenario({
      map: entry.data,
      waves: entry.waves,
      autoStartWaves: true,
      bot: buildOrder(fitOrder(entry.data, BALANCED_ORDER)),
      until: 'end',
    });
    expect(result.outcome).toBe('victory');
  });
});

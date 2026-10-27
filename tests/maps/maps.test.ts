import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MVP_MAP } from '../../src/data/maps';
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

describe('Tiled map files', () => {
  it('the registry serves the Training Ground file as the MVP map', () => {
    expect(MVP_MAP).toEqual({ ...load(TRAINING_GROUND), id: 'mvp' });
  });

  it.each(mapFiles)('%s imports and the reference bot wins it', (file) => {
    const map = load(file);
    const result = runScenario({
      map,
      autoStartWaves: true,
      bot: buildOrder(fitOrder(map, BALANCED_ORDER)),
      until: 'end',
    });
    expect(result.outcome).toBe('victory');
  });
});

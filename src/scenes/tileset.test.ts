import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAP_STYLE } from '../data/display';
import { MVP_MAP } from '../data/maps';
import { DECORATION_FRAMES, GROUND_FRAMES, ROAD_FRAMES } from '../data/sprites';
import { createMap, tileKey, type GameMap, type MapData, type Tile } from '../sim/map';
import { TILESET_FRAMES, decorationFor, roadShape, tileArt } from './tileset';

const atlas = JSON.parse(readFileSync('assets/atlas/sprites.json', 'utf8')) as { frames: Record<string, unknown> };

/** `map` with `tiles` made non-buildable, as a Tiled map will mark them (#58). */
function withBlocked(map: GameMap, tiles: readonly Tile[]): GameMap {
  const blocked = new Set(tiles.map(tileKey));
  return { ...map, isBuildable: (tile) => map.isBuildable(tile) && !blocked.has(tileKey(tile)) };
}

/** A 5×5 map whose Path follows `waypoints`. */
function mapOf(...waypoints: Tile[]): GameMap {
  const data: MapData = { id: 'test', cols: 5, rows: 5, waypoints };
  return createMap(data);
}

/** The road shape of each Path tile, in walking order. */
const shapes = (map: GameMap) => map.pathTiles.map((_, i) => roadShape(map, i));

describe('roadShape', () => {
  it('runs east–west along a horizontal Path and north–south along a vertical one', () => {
    expect(shapes(mapOf({ col: 0, row: 2 }, { col: 4, row: 2 }))).toEqual(Array(5).fill('eastWest'));
    expect(shapes(mapOf({ col: 2, row: 0 }, { col: 2, row: 4 }))).toEqual(Array(5).fill('northSouth'));
  });

  it('turns each corner with the frame joining the two sides the Path enters and leaves by', () => {
    // From the west edge, east, then south: the bend joins west and south.
    expect(roadShape(mapOf({ col: 0, row: 1 }, { col: 2, row: 1 }, { col: 2, row: 4 }), 2)).toBe('southWest');
    // From the west edge, east, then north.
    expect(roadShape(mapOf({ col: 0, row: 3 }, { col: 2, row: 3 }, { col: 2, row: 0 }), 2)).toBe('northWest');
    // From the north edge, south, then east.
    expect(roadShape(mapOf({ col: 1, row: 0 }, { col: 1, row: 2 }, { col: 4, row: 2 }), 2)).toBe('northEast');
    // From the south edge, north, then east.
    expect(roadShape(mapOf({ col: 1, row: 4 }, { col: 1, row: 2 }, { col: 4, row: 2 }), 2)).toBe('southEast');
  });

  it('connects the first and last tiles to the grid edge they are on', () => {
    // Enters on the top edge heading east: the first tile joins north (off the grid) and east.
    const map = mapOf({ col: 1, row: 0 }, { col: 3, row: 0 }, { col: 3, row: 4 });
    expect(shapes(map)[0]).toBe('northEast');
    // Exits on the bottom edge heading south: straight through.
    expect(shapes(map).at(-1)).toBe('northSouth');
    // Enters at a grid corner heading east: straight in from the west.
    expect(shapes(mapOf({ col: 0, row: 0 }, { col: 4, row: 0 }))[0]).toBe('eastWest');
  });

  it('follows walking order, not adjacency, where the Path runs beside itself', () => {
    // A hairpin: east along row 1, down, west along row 2. Row 1 and row 2 tiles touch, but only the bends join.
    const map = mapOf({ col: 0, row: 1 }, { col: 3, row: 1 }, { col: 3, row: 2 }, { col: 0, row: 2 });
    expect(shapes(map)).toEqual([...Array(3).fill('eastWest'), 'southWest', 'northWest', ...Array(3).fill('eastWest')]);
  });
});

describe('decorationFor', () => {
  const map = createMap(MVP_MAP);
  const blocked: Tile[] = [
    { col: 0, row: 0 },
    { col: 5, row: 5 },
    { col: 15, row: 9 },
    { col: 10, row: 8 },
  ];

  it('decorates every non-buildable tile off the Path, and no other tile', () => {
    const decorated = withBlocked(map, blocked);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const tile = { col, row };
        const decoration = decorationFor(decorated, tile);
        if (blocked.some((b) => tileKey(b) === tileKey(tile))) expect(DECORATION_FRAMES).toContain(decoration);
        else expect(decoration, tileKey(tile)).toBeNull();
      }
    }
  });

  it('is the same on every call for the same map, so screenshots are stable', () => {
    const a = withBlocked(createMap(MVP_MAP), blocked);
    const b = withBlocked(createMap(MVP_MAP), blocked);
    expect(blocked.map((tile) => decorationFor(a, tile))).toEqual(blocked.map((tile) => decorationFor(b, tile)));
  });

  it('varies with the tile and the map, rather than repeating one decoration', () => {
    const everyTile: Tile[] = [];
    for (let row = 0; row < map.rows; row++)
      for (let col = 0; col < map.cols; col++) if (!map.isPath({ col, row })) everyTile.push({ col, row });
    const all = withBlocked(map, everyTile);
    const picks = everyTile.map((tile) => decorationFor(all, tile));
    expect(new Set(picks)).toEqual(new Set(DECORATION_FRAMES));
    const other = withBlocked(createMap({ ...MVP_MAP, id: 'other' }), everyTile);
    expect(everyTile.map((tile) => decorationFor(other, tile))).not.toEqual(picks);
  });
});

describe('tileArt', () => {
  it('draws the MVP map: a road frame on each Path tile, plain buildable ground everywhere else', () => {
    const map = createMap(MVP_MAP);
    const art = tileArt(map);
    expect(art).toHaveLength(map.cols * map.rows);
    const roads = new Set(Object.values(ROAD_FRAMES));
    for (const { tile, ground, tint, decoration } of art) {
      if (map.isPath(tile)) expect(roads, tileKey(tile)).toContain(ground);
      else expect(ground, tileKey(tile)).toBe(GROUND_FRAMES.buildable);
      expect(tint).toBeUndefined();
      expect(decoration).toBeNull();
    }
    // The MVP Path has both straights and all four kinds of bend it makes.
    const pathFrames = new Set(art.filter(({ tile }) => map.isPath(tile)).map(({ ground }) => ground));
    expect(pathFrames.size).toBeGreaterThanOrEqual(4);
  });

  it('sets non-buildable tiles apart: their own ground, tinted darker, with a decoration', () => {
    const tile = { col: 5, row: 5 };
    const art = tileArt(withBlocked(createMap(MVP_MAP), [tile])).find((a) => tileKey(a.tile) === tileKey(tile))!;
    expect(art.ground).toBe(GROUND_FRAMES.blocked);
    expect(art.ground).not.toBe(GROUND_FRAMES.buildable);
    expect(art.tint).toBe(MAP_STYLE.blockedTint);
    expect(DECORATION_FRAMES).toContain(art.decoration);
  });
});

describe('TILESET_FRAMES', () => {
  it('lists every frame tileArt can draw, each one in the atlas', () => {
    const expected = [...Object.values(ROAD_FRAMES), ...Object.values(GROUND_FRAMES), ...DECORATION_FRAMES];
    expect([...TILESET_FRAMES].sort()).toEqual([...new Set(expected)].sort());
    for (const frame of TILESET_FRAMES) expect(Object.keys(atlas.frames)).toContain(frame);
  });
});

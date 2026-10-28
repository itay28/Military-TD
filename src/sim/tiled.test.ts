import { describe, expect, it } from 'vitest';
import { MIN_BUILDABLE_TILES } from '../data/maps';
import { InvalidMapError } from './map';
import { importTiledMap } from './tiled';

const PX = 48;
// GID 1 is plain ground, GID 2 is ground marked buildable.
const GROUND = 1;
const BUILDABLE = 2;
const FLIP_HORIZONTAL = 0x80000000;

type Json = Record<string, unknown>;

/**
 * A small valid Tiled map as JSON: a 10×6 grid, every tile buildable, and a Path entering on the left edge at row 1,
 * turning down at column 4 and leaving on the bottom edge. Path points sit on tile centres, as Tiled snaps them.
 */
function tiledMap({
  cols = 10,
  rows = 6,
  path = [
    [0, 1],
    [4, 1],
    [4, 5],
  ] as [number, number][],
} = {}): Json {
  return {
    type: 'map',
    orientation: 'orthogonal',
    infinite: false,
    width: cols,
    height: rows,
    tilewidth: PX,
    tileheight: PX,
    layers: [
      {
        type: 'tilelayer',
        name: 'ground',
        width: cols,
        height: rows,
        data: Array<number>(cols * rows).fill(BUILDABLE),
      },
      {
        type: 'objectgroup',
        name: 'path',
        objects: [
          {
            id: 1,
            name: 'path',
            x: PX / 2,
            y: PX / 2,
            polyline: path.map(([col, row]) => ({ x: col * PX, y: row * PX })),
          },
        ],
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'test',
        tilewidth: PX,
        tileheight: PX,
        tilecount: 2,
        columns: 2,
        tiles: [{ id: 1, properties: [{ name: 'buildable', type: 'bool', value: true }] }],
      },
    ],
  };
}

const layer = (map: Json, name: string) => (map.layers as Json[]).find((l) => l.name === name)!;
const groundData = (map: Json) => layer(map, 'ground').data as number[];

describe('importTiledMap', () => {
  it('converts a valid map to its grid, Path waypoints and buildable tiles', () => {
    const map = tiledMap();
    groundData(map)[0] = GROUND; // tile (0, 0) is not buildable
    const data = importTiledMap('small', map);
    expect(data).toMatchObject({ id: 'small', cols: 10, rows: 6 });
    expect(data.waypoints).toEqual([
      { col: 0, row: 1 },
      { col: 4, row: 1 },
      { col: 4, row: 5 },
    ]);
    expect(data.buildable).toHaveLength(59);
    expect(data.buildable).not.toContainEqual({ col: 0, row: 0 });
    expect(data.buildable).toContainEqual({ col: 9, row: 5 });
  });

  it('snaps Path points to the tile that contains them', () => {
    const map = tiledMap();
    const path = layer(map, 'path').objects as Json[];
    path[0] = {
      ...path[0],
      x: 3,
      y: 50,
      polyline: [
        { x: 0, y: 0 },
        { x: 200, y: 40 },
        { x: 205, y: 230 },
      ],
    };
    expect(importTiledMap('snap', map).waypoints).toEqual([
      { col: 0, row: 1 },
      { col: 4, row: 1 },
      { col: 4, row: 5 },
    ]);
  });

  it('reads the buildable property through flip flags', () => {
    const map = tiledMap();
    groundData(map)[0] = BUILDABLE | FLIP_HORIZONTAL;
    expect(importTiledMap('flip', map).buildable).toContainEqual({ col: 0, row: 0 });
  });

  it('counts only tiles marked buildable, and the property can be false', () => {
    const map = tiledMap();
    const tileset = (map.tilesets as Json[])[0]!;
    tileset.tiles = [{ id: 1, properties: [{ name: 'buildable', type: 'bool', value: false }] }];
    groundData(map).fill(GROUND);
    expect(() => importTiledMap('none', map)).toThrow(/0 buildable tiles/);
  });

  const broken: [string, (map: Json) => void, RegExp][] = [
    ['a map that is not orthogonal', (m) => (m.orientation = 'isometric'), /orthogonal/],
    ['an infinite map', (m) => (m.infinite = true), /infinite/],
    ['non-square tiles', (m) => (m.tileheight = 32), /square/],
    ['a tileset with another tile size', (m) => ((m.tilesets as Json[])[0]!.tilewidth = 32), /tileset "test".*48/],
    ['an external tileset', (m) => (m.tilesets = [{ firstgid: 1, source: 'ground.tsj' }]), /embed/],
    ['no ground layer', (m) => (layer(m, 'ground').name = 'floor'), /"ground" tile layer/],
    ['a ground layer of another size', (m) => (layer(m, 'ground').width = 9), /ground.*10×6/],
    ['ground data of the wrong length', (m) => groundData(m).pop(), /ground.*60 tiles/],
    ['encoded ground data', (m) => (layer(m, 'ground').data = 'AAAA'), /CSV/],
    ['a GID that no tileset has', (m) => (groundData(m)[3] = 7), /GID 7/],
    ['no path layer', (m) => (layer(m, 'path').name = 'route'), /"path" object layer/],
    [
      'a polyline point without a number',
      (m) => (((layer(m, 'path').objects as Json[])[0]!.polyline as Json[])[1]!.x = 'left'),
      /numeric x and y/,
    ],
    [
      'a polyline origin that is not a number',
      (m) => ((layer(m, 'path').objects as Json[])[0]!.x = null),
      /numeric x and y/,
    ],
    ['a path layer without a polyline', (m) => (layer(m, 'path').objects = []), /one polyline/],
    [
      'a Path that starts off the edge',
      (m) =>
        Object.assign(
          m,
          tiledMap({
            path: [
              [1, 1],
              [4, 1],
              [4, 5],
            ],
          }),
        ),
      /start on the grid edge/,
    ],
    [
      'a Path that ends off the edge',
      (m) =>
        Object.assign(
          m,
          tiledMap({
            path: [
              [0, 1],
              [4, 1],
              [4, 4],
            ],
          }),
        ),
      /end on the grid edge/,
    ],
    [
      'a diagonal step',
      (m) =>
        Object.assign(
          m,
          tiledMap({
            path: [
              [0, 1],
              [3, 2],
              [3, 5],
            ],
          }),
        ),
      /not orthogonal/,
    ],
    [
      'a Path that revisits a tile',
      (m) =>
        Object.assign(
          m,
          tiledMap({
            path: [
              [0, 2],
              [5, 2],
              [5, 0],
              [3, 0],
              [3, 5],
            ],
          }),
        ),
      /revisits/,
    ],
    [
      'too few buildable tiles',
      (m) => groundData(m).fill(GROUND, 0, 60 - MIN_BUILDABLE_TILES + 5),
      new RegExp(`at least ${MIN_BUILDABLE_TILES}`),
    ],
    ['data that is not a Tiled map', (m) => delete m.layers, /layers/],
  ];

  it.each(broken)('rejects %s', (_, breakIt, message) => {
    const map = tiledMap();
    breakIt(map);
    expect(() => importTiledMap('bad', map)).toThrow(InvalidMapError);
    expect(() => importTiledMap('bad', map)).toThrow(message);
  });

  it('names the map in the error', () => {
    expect(() => importTiledMap('bad', null)).toThrow(/^Map "bad":/);
  });
});

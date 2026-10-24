import { describe, expect, it } from 'vitest';
import { createMap, InvalidMapError, tileCenter, type MapData } from './map';

// A 6×5 grid; the Path enters on the left edge and leaves on the bottom edge.
const SMALL: MapData = {
  id: 'small',
  cols: 6,
  rows: 5,
  waypoints: [
    { col: 0, row: 1 },
    { col: 3, row: 1 },
    { col: 3, row: 4 },
  ],
};

describe('createMap', () => {
  it('Path tiles include every tile between consecutive waypoints, in walking order', () => {
    const map = createMap(SMALL);
    expect(map.pathTiles).toEqual([
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 3, row: 1 },
      { col: 3, row: 2 },
      { col: 3, row: 3 },
      { col: 3, row: 4 },
    ]);
  });

  it('Path tiles follow segments going left and up, with each corner tile once', () => {
    const map = createMap({
      id: 'left-up',
      cols: 4,
      rows: 4,
      waypoints: [
        { col: 3, row: 3 },
        { col: 1, row: 3 },
        { col: 1, row: 0 },
      ],
    });
    expect(map.pathTiles).toEqual([
      { col: 3, row: 3 },
      { col: 2, row: 3 },
      { col: 1, row: 3 },
      { col: 1, row: 2 },
      { col: 1, row: 1 },
      { col: 1, row: 0 },
    ]);
  });

  it('Path tiles are not buildable', () => {
    const map = createMap(SMALL);
    for (const tile of map.pathTiles) {
      expect(map.isPath(tile)).toBe(true);
      expect(map.isBuildable(tile)).toBe(false);
    }
  });

  it('tiles off the Path inside the grid are buildable', () => {
    const map = createMap(SMALL);
    for (const tile of [
      { col: 0, row: 0 },
      { col: 5, row: 4 },
      { col: 2, row: 2 },
      { col: 4, row: 1 },
    ]) {
      expect(map.isPath(tile)).toBe(false);
      expect(map.isBuildable(tile)).toBe(true);
    }
  });

  it('tiles outside the grid are neither in bounds nor buildable', () => {
    const map = createMap(SMALL);
    for (const tile of [
      { col: -1, row: 0 },
      { col: 6, row: 0 },
      { col: 0, row: -1 },
      { col: 0, row: 5 },
      { col: 1.5, row: 2 },
    ]) {
      expect(map.inBounds(tile)).toBe(false);
      expect(map.isBuildable(tile)).toBe(false);
    }
    expect(map.inBounds({ col: 5, row: 4 })).toBe(true);
  });

  it('waypoint positions are the tile centers', () => {
    expect(createMap(SMALL).waypointPositions).toEqual([
      { x: 0.5, y: 1.5 },
      { x: 3.5, y: 1.5 },
      { x: 3.5, y: 4.5 },
    ]);
    expect(tileCenter({ col: 15, row: 9 })).toEqual({ x: 15.5, y: 9.5 });
  });
});

describe('createMap validation', () => {
  const withWaypoints = (...waypoints: [number, number][]): MapData => ({
    ...SMALL,
    waypoints: waypoints.map(([col, row]) => ({ col, row })),
  });

  it.each([
    ['a diagonal segment', withWaypoints([0, 1], [2, 3], [2, 4]), /not orthogonal/],
    ['a waypoint outside the grid', withWaypoints([0, 1], [6, 1]), /outside the 6×5 grid/],
    ['fewer than two waypoints', withWaypoints([0, 1]), /at least two waypoints/],
    ['a repeated waypoint', withWaypoints([0, 1], [3, 1], [3, 1], [3, 4]), /zero-length/],
    ['non-integer coordinates', withWaypoints([0, 1.5], [3, 1.5], [3, 4]), /outside the 6×5 grid/],
    ['a start off the grid edge', withWaypoints([1, 1], [3, 1], [3, 4]), /start .* edge/],
    ['an end off the grid edge', withWaypoints([0, 1], [3, 1], [3, 3]), /end .* edge/],
    ['a Path that doubles back', withWaypoints([0, 1], [4, 1], [2, 1], [2, 4]), /revisits/],
    ['a Path that crosses itself', withWaypoints([0, 2], [4, 2], [4, 0], [2, 0], [2, 4]), /revisits tile 2,2/],
    ['an empty grid', { ...SMALL, cols: 0 }, /grid size/],
    ['a fractional grid size', { ...SMALL, rows: 4.5 }, /grid size/],
  ])('rejects %s', (_, data, message) => {
    expect(() => createMap(data)).toThrow(InvalidMapError);
    expect(() => createMap(data)).toThrow(message);
  });

  it('names the map in the error', () => {
    expect(() => createMap(withWaypoints([0, 1]))).toThrow(/^Map "small":/);
  });
});

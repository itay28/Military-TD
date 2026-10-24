import { describe, expect, it } from 'vitest';
import { createMap, type Tile } from '../sim/map';
import { MVP_MAP } from './maps';

function edgesOf({ col, row }: Tile, cols: number, rows: number): string[] {
  return [col === 0 && 'left', col === cols - 1 && 'right', row === 0 && 'top', row === rows - 1 && 'bottom'].filter(
    (edge): edge is string => edge !== false,
  );
}

describe('MVP map', () => {
  it('is a valid 16×10 map', () => {
    const map = createMap(MVP_MAP);
    expect([map.cols, map.rows]).toEqual([16, 10]);
  });

  it('enters on one edge and exits on another', () => {
    const { waypoints, cols, rows } = createMap(MVP_MAP);
    const entry = edgesOf(waypoints[0]!, cols, rows);
    const exit = edgesOf(waypoints[waypoints.length - 1]!, cols, rows);
    expect(entry).toHaveLength(1);
    expect(exit).toHaveLength(1);
    expect(exit).not.toEqual(entry);
  });
});

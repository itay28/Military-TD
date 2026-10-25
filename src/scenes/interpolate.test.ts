import { describe, expect, it } from 'vitest';
import { interpolatePosition, snapshotPositions } from './interpolate';

const at = (id: number, x: number, y: number) => ({ id, position: { x, y } });

describe('interpolatePosition', () => {
  it('lerps from the previous tick position to the current one by alpha', () => {
    const previous = snapshotPositions([at(1, 1, 2)]);
    expect(interpolatePosition(previous, at(1, 3, 2), 0)).toEqual({ x: 1, y: 2 });
    expect(interpolatePosition(previous, at(1, 3, 2), 0.25)).toEqual({ x: 1.5, y: 2 });
    expect(interpolatePosition(previous, at(1, 3, 6), 0.5)).toEqual({ x: 2, y: 4 });
  });

  it('snaps an entity with no previous position (just spawned) to where it is', () => {
    const previous = snapshotPositions([at(1, 0, 0)]);
    expect(interpolatePosition(previous, at(2, 5, 5), 0.5)).toEqual({ x: 5, y: 5 });
  });
});

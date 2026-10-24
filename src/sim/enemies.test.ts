import { describe, expect, it } from 'vitest';
import { createRoute } from './enemies';

// Right 3, down 3, left 2: an L with a hook, 8 tiles long.
const POINTS = [
  { x: 0.5, y: 1.5 },
  { x: 3.5, y: 1.5 },
  { x: 3.5, y: 4.5 },
  { x: 1.5, y: 4.5 },
];

describe('createRoute', () => {
  it('route length is the sum of its segment lengths', () => {
    expect(createRoute(POINTS).length).toBe(8);
  });

  it('route position is the first waypoint at 0 and the last at the full length', () => {
    const route = createRoute(POINTS);
    expect(route.positionAt(0)).toEqual({ x: 0.5, y: 1.5 });
    expect(route.positionAt(8)).toEqual({ x: 1.5, y: 4.5 });
  });

  it('route position exactly at a corner is that waypoint', () => {
    const route = createRoute(POINTS);
    expect(route.positionAt(3)).toEqual({ x: 3.5, y: 1.5 });
    expect(route.positionAt(6)).toEqual({ x: 3.5, y: 4.5 });
  });

  it('route position past a corner is on the next segment, the right distance past it', () => {
    const route = createRoute(POINTS);
    expect(route.positionAt(3.25)).toEqual({ x: 3.5, y: 1.75 });
    expect(route.positionAt(7)).toEqual({ x: 2.5, y: 4.5 });
    expect(route.positionAt(1.5)).toEqual({ x: 2, y: 1.5 });
  });

  it('route positions outside [0, length] clamp to the ends', () => {
    const route = createRoute(POINTS);
    expect(route.positionAt(-1)).toEqual({ x: 0.5, y: 1.5 });
    expect(route.positionAt(100)).toEqual({ x: 1.5, y: 4.5 });
  });
});

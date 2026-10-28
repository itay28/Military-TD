import { describe, expect, it } from 'vitest';
import { SPRITE_HEADING } from '../data/sprites';
import { headingOf, spriteRotation } from './heading';

describe('headingOf', () => {
  it('points the way the enemy moved this tick, 0 east and π/2 south (canvas y grows down)', () => {
    expect(headingOf({ x: 1, y: 2 }, { x: 1.1, y: 2 }, 9)).toBeCloseTo(0);
    expect(headingOf({ x: 1, y: 2 }, { x: 1, y: 2.1 }, 9)).toBeCloseTo(Math.PI / 2);
    expect(headingOf({ x: 1, y: 2 }, { x: 0.9, y: 2 }, 9)).toBeCloseTo(Math.PI);
    expect(headingOf({ x: 1, y: 2 }, { x: 1, y: 1.9 }, 9)).toBeCloseTo(-Math.PI / 2);
  });

  it('turns part way across a path corner: east then south reads south-east', () => {
    // The tick straddles the corner at (3, 2): it moved 0.05 east, then 0.05 south.
    expect(headingOf({ x: 2.95, y: 2 }, { x: 3, y: 2.05 }, 0)).toBeCloseTo(Math.PI / 4);
    // Further past the corner the south leg dominates.
    expect(headingOf({ x: 2.98, y: 2 }, { x: 3, y: 2.08 }, 0)).toBeGreaterThan(Math.PI / 4);
  });

  it('keeps the fallback (the last heading) when the enemy just spawned or did not move', () => {
    expect(headingOf(undefined, { x: 1, y: 2 }, 1.5)).toBe(1.5);
    expect(headingOf({ x: 1, y: 2 }, { x: 1, y: 2 }, -1.5)).toBe(-1.5);
  });
});

describe('spriteRotation', () => {
  it('turns a sprite from the way its frame faces to the heading', () => {
    expect(SPRITE_HEADING.infantry).toBe(0); // the Kenney TD units face east
    expect(spriteRotation('infantry', 0)).toBeCloseTo(0);
    expect(spriteRotation('infantry', Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(SPRITE_HEADING.tank).toBeCloseTo(-Math.PI / 2); // the Tanks pack body faces north
    expect(spriteRotation('tank', 0)).toBeCloseTo(Math.PI / 2);
    expect(spriteRotation('tank', -Math.PI / 2)).toBeCloseTo(0);
  });
});

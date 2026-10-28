import { describe, expect, it } from 'vitest';
import { aimAngle, turnToward } from './turret';

const TOWER = { x: 2.5, y: 2.5 };

describe('aimAngle', () => {
  it('points at 0 for a target due east', () => {
    expect(aimAngle(TOWER, { x: 5, y: 2.5 }, 1)).toBeCloseTo(0);
  });

  it('points at −π/2 for a target due north (rows grow down)', () => {
    expect(aimAngle(TOWER, { x: 2.5, y: 0.5 }, 1)).toBeCloseTo(-Math.PI / 2);
  });

  it('points at π/2 for a target due south', () => {
    expect(aimAngle(TOWER, { x: 2.5, y: 4 }, 1)).toBeCloseTo(Math.PI / 2);
  });

  it('keeps its last angle with no target', () => {
    expect(aimAngle(TOWER, undefined, 1.25)).toBe(1.25);
  });

  it('keeps its last angle for a target on its own center', () => {
    expect(aimAngle(TOWER, TOWER, 1.25)).toBe(1.25);
  });
});

describe('turnToward', () => {
  it('turns at most maxStep a frame', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0, -1, 0.25)).toBeCloseTo(-0.25);
  });

  it('reaches the desired angle without overshooting', () => {
    expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
  });

  it('turns the short way across ±π', () => {
    const next = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    expect(next).toBeCloseTo(Math.PI - 0.05);
    expect(turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(-Math.PI + 0.1);
  });

  it('keeps the angle in (−π, π]', () => {
    const next = turnToward(Math.PI - 0.01, -Math.PI + 0.1, 0.05);
    expect(next).toBeGreaterThan(-Math.PI);
    expect(next).toBeLessThanOrEqual(Math.PI);
    expect(next).toBeCloseTo(-Math.PI + 0.04);
  });

  it('does not move with a step of 0', () => {
    expect(turnToward(0.5, 2, 0)).toBe(0.5);
  });
});

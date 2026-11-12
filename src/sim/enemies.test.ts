import { describe, expect, it } from 'vitest';
import { createPathLine, leadBoss, type Enemy } from './enemies';

// Right 3, down 3, left 2: an L with a hook, 8 tiles long.
const POINTS = [
  { x: 0.5, y: 1.5 },
  { x: 3.5, y: 1.5 },
  { x: 3.5, y: 4.5 },
  { x: 1.5, y: 4.5 },
];

describe('createPathLine', () => {
  it('Path line length is the sum of its segment lengths', () => {
    expect(createPathLine(POINTS).length).toBe(8);
  });

  it('Path line position is the first waypoint at 0 and the last at the full length', () => {
    const line = createPathLine(POINTS);
    expect(line.positionAt(0)).toEqual({ x: 0.5, y: 1.5 });
    expect(line.positionAt(8)).toEqual({ x: 1.5, y: 4.5 });
  });

  it('Path line position exactly at a waypoint is that waypoint', () => {
    const line = createPathLine(POINTS);
    expect(line.positionAt(3)).toEqual({ x: 3.5, y: 1.5 });
    expect(line.positionAt(6)).toEqual({ x: 3.5, y: 4.5 });
  });

  it('Path line position past a waypoint is on the next segment, the right distance past it', () => {
    const line = createPathLine(POINTS);
    expect(line.positionAt(3.25)).toEqual({ x: 3.5, y: 1.75 });
    expect(line.positionAt(7)).toEqual({ x: 2.5, y: 4.5 });
    expect(line.positionAt(1.5)).toEqual({ x: 2, y: 1.5 });
  });

  it('Path line positions outside [0, length] clamp to the ends', () => {
    const line = createPathLine(POINTS);
    expect(line.positionAt(-1)).toEqual({ x: 0.5, y: 1.5 });
    expect(line.positionAt(100)).toEqual({ x: 1.5, y: 4.5 });
  });
});

const enemy = (id: number, distance: number, boss?: true): Enemy => ({
  id,
  kind: boss ? 'heavyTank' : 'tank',
  maxHp: 100,
  hp: 100,
  speed: 1,
  reward: 0,
  leakCost: 1,
  armor: 0,
  layer: 'ground',
  distance,
  position: { x: 0, y: 0 },
  ...(boss ? { boss } : {}),
});

describe('leadBoss', () => {
  it('is undefined with no enemies on the field', () => {
    expect(leadBoss([])).toBeUndefined();
  });

  it('is undefined when no enemy on the field is a boss', () => {
    expect(leadBoss([enemy(1, 3), enemy(2, 5)])).toBeUndefined();
  });

  it('is the boss on the field, ahead of ordinary enemies', () => {
    expect(leadBoss([enemy(1, 5), enemy(2, 2, true), enemy(3, 4)])?.id).toBe(2);
  });

  it('with two bosses on the field, is the one nearest the HQ (furthest along the Path)', () => {
    expect(leadBoss([enemy(1, 2, true), enemy(2, 6, true), enemy(3, 4, true)])?.id).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { coverageIntervals } from './coverage';
import { createPathLine } from './enemies';

describe('coverageIntervals', () => {
  // A straight line along y = 0.5 from x = 0 to x = 10.
  const straight = createPathLine([
    { x: 0, y: 0.5 },
    { x: 10, y: 0.5 },
  ]);

  it('gives one interval for a straight pass, entered where the line meets the range circle', () => {
    // Center (5, 2.5): 2 tiles off the line, range 2.5 → half-chord 1.5.
    const intervals = coverageIntervals(straight, { x: 5, y: 2.5 }, 2.5);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.enter).toBeCloseTo(3.5);
    expect(intervals[0]!.exit).toBeCloseTo(6.5);
    expect(intervals[0]!.entry.x).toBeCloseTo(3.5);
    expect(intervals[0]!.entry.y).toBeCloseTo(0.5);
  });

  it('gives none when the line never comes within range', () => {
    expect(coverageIntervals(straight, { x: 5, y: 5 }, 2.5)).toEqual([]);
  });

  it('clamps to the ends of the line', () => {
    const intervals = coverageIntervals(straight, { x: 0, y: 0.5 }, 2);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.enter).toBeCloseTo(0);
    expect(intervals[0]!.exit).toBeCloseTo(2);
  });

  it('splits a pass in two around minRange', () => {
    // Center on the line at x = 5: range 3, dead zone 1.5.
    const intervals = coverageIntervals(straight, { x: 5, y: 0.5 }, 3, 1.5);
    expect(intervals.map(({ enter, exit }) => [enter, exit])).toEqual([
      [expect.closeTo(2), expect.closeTo(3.5)],
      [expect.closeTo(6.5), expect.closeTo(8)],
    ]);
  });

  it('gives one interval per pass on a hairpin, in walking order', () => {
    // East along y = 0.5 to x = 10, down to y = 4.5, back west to x = 0.
    const hairpin = createPathLine([
      { x: 0, y: 0.5 },
      { x: 10, y: 0.5 },
      { x: 10, y: 4.5 },
      { x: 0, y: 4.5 },
    ]);
    // Center (5, 2.5): both legs 2 tiles off; the far leg at x = 10 is 5 away, out of range 2.5.
    const intervals = coverageIntervals(hairpin, { x: 5, y: 2.5 }, 2.5);
    expect(intervals.map(({ enter, exit }) => [enter, exit])).toEqual([
      [expect.closeTo(3.5), expect.closeTo(6.5)],
      [expect.closeTo(14 + 3.5), expect.closeTo(14 + 6.5)],
    ]);
    expect(intervals[1]!.entry.x).toBeCloseTo(6.5);
    expect(intervals[1]!.entry.y).toBeCloseTo(4.5);
  });

  it('joins a pass across a bend into one interval', () => {
    const bend = createPathLine([
      { x: 0, y: 0.5 },
      { x: 5, y: 0.5 },
      { x: 5, y: 5.5 },
    ]);
    const intervals = coverageIntervals(bend, { x: 5, y: 0.5 }, 2);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]!.enter).toBeCloseTo(3);
    expect(intervals[0]!.exit).toBeCloseTo(7);
  });
});

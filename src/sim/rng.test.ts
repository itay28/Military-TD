import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

const draw = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng', () => {
  it('the same seed gives the same sequence', () => {
    expect(draw(42, 20)).toEqual(draw(42, 20));
  });

  it('different seeds give different sequences', () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  it('next() stays in [0, 1) and is not constant', () => {
    const values = draw(7, 1000);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(990);
  });

  it('int(min, max) stays in range, both ends included, and reaches each', () => {
    const rng = createRng(3);
    const seen = new Set(Array.from({ length: 500 }, () => rng.int(2, 5)));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('int throws RangeError when max is below min or a bound is not whole', () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 2)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
  });
});

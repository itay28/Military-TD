import { describe, expect, it } from 'vitest';
import { damageTaken } from './combat';

describe('damageTaken', () => {
  it('armor takes a flat amount off', () => {
    expect(damageTaken(10, 0, 0, 100)).toBe(10);
    expect(damageTaken(10, 3, 0, 100)).toBe(7);
  });

  it('pierce cancels armor up to its value, never adding damage', () => {
    expect(damageTaken(10, 6, 4, 100)).toBe(8);
    expect(damageTaken(10, 6, 6, 100)).toBe(10);
    expect(damageTaken(10, 6, 9, 100)).toBe(10);
    expect(damageTaken(10, 0, 5, 100)).toBe(10);
  });

  it('a hit always deals at least 1', () => {
    expect(damageTaken(10, 10, 0, 100)).toBe(1);
    expect(damageTaken(10, 50, 0, 100)).toBe(1);
  });

  it('a hit never removes more HP than is left', () => {
    expect(damageTaken(10, 0, 0, 4)).toBe(4);
    expect(damageTaken(10, 50, 0, 0.5)).toBe(0.5);
  });
});

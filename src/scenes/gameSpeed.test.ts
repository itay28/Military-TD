import { describe, expect, it } from 'vitest';
import { GAME_SPEEDS, MAX_GAME_SPEED, nextSpeed } from './gameSpeed';

describe('nextSpeed', () => {
  it('cycles ×1 → ×2 → ×4 → ×1', () => {
    expect([nextSpeed(1), nextSpeed(2), nextSpeed(4)]).toEqual([2, 4, 1]);
  });

  it('the fastest speed is the last in the cycle', () => {
    expect(GAME_SPEEDS.at(-1)).toBe(MAX_GAME_SPEED);
  });
});

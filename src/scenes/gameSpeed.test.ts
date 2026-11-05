import { describe, expect, it } from 'vitest';
import { GAME_SPEEDS, MAX_GAME_SPEED, nextSpeed } from './gameSpeed';

describe('GAME_SPEEDS', () => {
  it('the fastest speed is the last', () => {
    expect(GAME_SPEEDS.at(-1)).toBe(MAX_GAME_SPEED);
  });
});

describe('nextSpeed', () => {
  it('cycles ×1 → ×2 → ×3 → ×1, for the F key', () => {
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(3);
    expect(nextSpeed(3)).toBe(1);
  });
});

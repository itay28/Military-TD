import { describe, expect, it } from 'vitest';
import { GAME_SPEEDS, MAX_GAME_SPEED } from './gameSpeed';

describe('GAME_SPEEDS', () => {
  it('the fastest speed is the last', () => {
    expect(GAME_SPEEDS.at(-1)).toBe(MAX_GAME_SPEED);
  });
});

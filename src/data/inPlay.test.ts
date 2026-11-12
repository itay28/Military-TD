import { describe, expect, it } from 'vitest';
import { HARD_IN_PLAY } from './inPlay';

describe('in-play switches', () => {
  it('puts Hard in play for players (#548)', () => {
    expect(HARD_IN_PLAY).toBe(true);
  });
});

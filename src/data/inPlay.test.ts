import { describe, expect, it } from 'vitest';
import { HARD_IN_PLAY } from './inPlay';

describe('in-play switches', () => {
  it('keeps Hard hidden from players until its rollout issue turns it on', () => {
    expect(HARD_IN_PLAY).toBe(false);
  });
});

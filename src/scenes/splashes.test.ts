import { describe, expect, it } from 'vitest';
import { createSplashes } from './splashes';

const AT = { x: 10, y: 20 };

describe('createSplashes', () => {
  it('shows a new splash at its position and radius, fully opaque', () => {
    const splashes = createSplashes(150);
    splashes.add(AT, 48);
    expect(splashes.active()).toEqual([{ at: AT, radius: 48, alpha: 1 }]);
  });

  it('fades a splash and drops it when done', () => {
    const splashes = createSplashes(100);
    splashes.add(AT, 48);
    splashes.advance(50);
    expect(splashes.active()[0]?.alpha).toBeCloseTo(0.5);
    splashes.advance(50);
    expect(splashes.active()).toEqual([]);
  });

  it('has a 0 ms lifetime with anim=0: never shown', () => {
    const splashes = createSplashes(0);
    splashes.add(AT, 48);
    expect(splashes.active()).toEqual([]);
  });
});

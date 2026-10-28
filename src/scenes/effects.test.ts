import { describe, expect, it } from 'vitest';
import { createEffects } from './effects';

const AT = { x: 24, y: 48 };

describe('createEffects', () => {
  it('shows a new effect at its place, at the start of its life', () => {
    const effects = createEffects(200);
    effects.add('muzzleFlash', AT);
    expect(effects.active()).toEqual([{ kind: 'muzzleFlash', at: AT, progress: 0 }]);
  });

  it('ages an effect on real time', () => {
    const effects = createEffects(200);
    effects.add('puff', AT);
    effects.advance(50);
    expect(effects.active()[0]?.progress).toBeCloseTo(0.25);
  });

  it('drops an effect once its life is over', () => {
    const effects = createEffects(200);
    effects.add('explosion', AT);
    effects.advance(200);
    expect(effects.active()).toEqual([]);
  });

  it('ages effects independently and keeps their kinds', () => {
    const effects = createEffects(200);
    effects.add('muzzleFlash', AT);
    effects.advance(150);
    effects.add('puff', { x: 0, y: 0 });
    effects.advance(100);
    expect(effects.active()).toEqual([{ kind: 'puff', at: { x: 0, y: 0 }, progress: 0.5 }]);
  });

  it('never shows an effect with no life, for ?anim=0', () => {
    const effects = createEffects(0);
    effects.add('muzzleFlash', AT);
    expect(effects.active()).toEqual([]);
  });
});

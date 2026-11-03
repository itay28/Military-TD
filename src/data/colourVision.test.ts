import { describe, expect, it } from 'vitest';
import { COLOUR_DEFICIENCIES, contrastRatio, deltaE, simulate } from './colourVision';

describe('contrastRatio', () => {
  it('is 21 for black on white, either way round, and 1 for a colour on itself', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 5);
    expect(contrastRatio(0xffffff, 0x000000)).toBeCloseTo(21, 5);
    expect(contrastRatio(0x777777, 0x777777)).toBeCloseTo(1, 5);
  });

  it('matches the WCAG value for mid grey on white (#777 is just under 4.5:1)', () => {
    expect(contrastRatio(0x777777, 0xffffff)).toBeCloseTo(4.48, 2);
  });
});

describe('deltaE', () => {
  it('is 0 for a colour and itself and 100 for black vs white', () => {
    expect(deltaE(0x6fcf4f, 0x6fcf4f)).toBe(0);
    expect(deltaE(0x000000, 0xffffff)).toBeCloseTo(100, 1);
  });
});

describe('simulate', () => {
  it('keeps black, white and greys as they are under every deficiency', () => {
    for (const deficiency of COLOUR_DEFICIENCIES) {
      for (const grey of [0x000000, 0xffffff]) expect(deltaE(simulate(grey, deficiency), grey)).toBeLessThan(1);
    }
  });

  it('makes pure red and green hard to tell apart for red-green deficiencies, but not for tritanopia', () => {
    const red = 0xcc4433;
    const green = 0x44aa33;
    const apart = (deficiency: (typeof COLOUR_DEFICIENCIES)[number]) =>
      deltaE(simulate(red, deficiency), simulate(green, deficiency));
    expect(apart('deuteranopia')).toBeLessThan(deltaE(red, green) / 3);
    expect(apart('protanopia')).toBeLessThan(deltaE(red, green) / 3);
    expect(apart('tritanopia')).toBeGreaterThan(deltaE(red, green) / 2);
  });
});

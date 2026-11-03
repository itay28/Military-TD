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

  it('collapses the old green/red Ghost pair for deuteranopia, though it is far apart with normal vision and tritanopia', () => {
    const green = 0x6fcf4f;
    const red = 0xe0533d;
    expect(deltaE(green, red)).toBeGreaterThan(100);
    expect(deltaE(simulate(green, 'deuteranopia'), simulate(red, 'deuteranopia'))).toBeLessThan(20);
    expect(deltaE(simulate(green, 'tritanopia'), simulate(red, 'tritanopia'))).toBeGreaterThan(100);
  });
});

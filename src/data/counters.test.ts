import { describe, expect, it } from 'vitest';
import { counteredBy, poorAgainst, resists, strongAgainst } from './counters';

describe('counters', () => {
  it('a Cannon is strong against Tanks and poor against Helicopters, which it cannot hit', () => {
    expect(strongAgainst('cannon')).toContain('tank');
    expect(poorAgainst('cannon')).toContain('helicopter');
  });

  it('a Helicopter is countered by the AA Gun and resists the Cannon and Mortar', () => {
    expect(counteredBy('helicopter')).toContain('aaGun');
    expect(resists('helicopter')).toEqual(expect.arrayContaining(['cannon', 'mortar']));
  });

  it('a Tank resists the Rifle Nest', () => {
    expect(resists('tank')).toContain('rifleNest');
    expect(counteredBy('tank')).not.toContain('rifleNest');
  });

  it('a kind is never both strong and poor against the same one', () => {
    for (const tower of ['rifleNest', 'aaGun', 'cannon', 'mortar'] as const) {
      expect(strongAgainst(tower).filter((e) => poorAgainst(tower).includes(e))).toEqual([]);
    }
  });
});

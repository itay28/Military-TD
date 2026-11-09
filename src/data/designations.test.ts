import { describe, expect, it } from 'vitest';
import renderSprites from '../../scripts/render-sprite.json';
import * as display from './display';
import { allDepicts, designationsIn, findDesignation } from './designations';
import { CLASS_LINES, fieldManualEntries } from './fieldManual';

// ADR-0009's legal guardrail: the models depict real equipment, but the game never names it.

/** Every string in a nested value: the player-visible text in a data module. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('designationsIn', () => {
  const found = designationsIn(allDepicts(renderSprites));

  it.each(['M1A2', 'T-72', 'ZU-23', 'UH-60', 'Mi-8', '2B14', 'Type 99', 'Humvee', 'Hilux', 'Toyota', 'Black Hawk'])(
    'finds %s in the render list',
    (name) => {
      expect(found).toContain(name);
    },
  );

  it('takes the stem of a variant, so T-72B3 also bans T-72', () => {
    expect(designationsIn(['T-72B3 main battle tank'])).toEqual(expect.arrayContaining(['T-72B3', 'T-72']));
  });

  it('ignores calibres and plain words', () => {
    expect(designationsIn(['twin 35 mm, 4x4, main battle tank'])).toEqual([]);
  });

  it('matches whole designations only', () => {
    expect(findDesignation('Fires 120 mm shells at TANKS', ['T-72'])).toBeUndefined();
    expect(findDesignation('Looks like a T-72', ['T-72'])).toBe('T-72');
  });
});

describe('player-visible text', () => {
  const banned = designationsIn(allDepicts(renderSprites));

  it.each(Object.keys(display))('display.%s names no real equipment', (name) => {
    for (const text of strings((display as Record<string, unknown>)[name])) {
      expect(findDesignation(text, banned), text).toBeUndefined();
    }
  });

  it('the Field manual names no real equipment', () => {
    for (const text of strings([CLASS_LINES, fieldManualEntries()])) {
      expect(findDesignation(text, banned), text).toBeUndefined();
    }
  });
});

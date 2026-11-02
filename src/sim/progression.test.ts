import { describe, expect, it } from 'vitest';
import { isUnlocked, starsFor, unlocksNext, type CompletedMaps } from './progression';

describe('starsFor', () => {
  it.each([
    [20, 3],
    [19, 2],
    [10, 2],
    [9, 1],
    [1, 1],
    [0, 0],
  ] as const)('gives %i of 20 Lives left %i stars', (livesLeft, stars) => {
    expect(starsFor(livesLeft, 20)).toBe(stars);
  });

  it('rounds half the start Lives up for an odd start: 3 of 5 is 2 stars, 2 of 5 is 1', () => {
    expect(starsFor(3, 5)).toBe(2);
    expect(starsFor(2, 5)).toBe(1);
  });
});

describe('isUnlocked', () => {
  const MAP_IDS = ['first', 'second', 'third'];
  const won = (...ids: string[]): CompletedMaps => ({
    maps: Object.fromEntries(ids.map((id) => [id, { completed: true }])),
  });

  it('always unlocks the first map', () => {
    expect(isUnlocked(0, MAP_IDS, won())).toBe(true);
  });

  it('locks the second map until the first is completed, with any stars', () => {
    expect(isUnlocked(1, MAP_IDS, won())).toBe(false);
    expect(isUnlocked(1, MAP_IDS, won('first'))).toBe(true);
  });

  it('unlocks the third map only after the second, not the first alone', () => {
    expect(isUnlocked(2, MAP_IDS, won('first'))).toBe(false);
    expect(isUnlocked(2, MAP_IDS, won('first', 'second'))).toBe(true);
  });

  it('does not count a saved entry that is not completed', () => {
    expect(isUnlocked(1, MAP_IDS, { maps: { first: { completed: false } } })).toBe(false);
  });

  it('unlocks no map outside the list', () => {
    expect(isUnlocked(3, MAP_IDS, won('first', 'second', 'third'))).toBe(false);
    expect(isUnlocked(-1, MAP_IDS, won())).toBe(false);
  });
});

describe('unlocksNext', () => {
  const MAP_IDS = ['first', 'second', 'third'];

  it('is true for the first win of a map that has a locked map after it', () => {
    expect(unlocksNext(0, MAP_IDS, { maps: {} })).toBe(true);
  });

  it('is false when the next map is unlocked already, so a replay unlocks nothing new', () => {
    expect(unlocksNext(0, MAP_IDS, { maps: { first: { completed: true } } })).toBe(false);
  });

  it('is false for the last map and for a map outside the list', () => {
    expect(unlocksNext(2, MAP_IDS, { maps: {} })).toBe(false);
    expect(unlocksNext(-1, MAP_IDS, { maps: {} })).toBe(false);
  });
});

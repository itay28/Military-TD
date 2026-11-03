import { describe, expect, it } from 'vitest';
import { FACTIONS, isFaction } from './factions';

describe('factions (ADR-0009)', () => {
  it('are the four sides a map can name', () => {
    expect(FACTIONS).toEqual(['us', 'russia', 'china', 'insurgents']);
  });

  it.each(FACTIONS)('%s is a Faction', (faction) => {
    expect(isFaction(faction)).toBe(true);
  });

  it.each(['nato', 'US', 'gla', '', 3, null, undefined])('%j is not a Faction', (value) => {
    expect(isFaction(value)).toBe(false);
  });
});

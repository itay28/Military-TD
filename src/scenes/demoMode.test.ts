import { describe, expect, it } from 'vitest';
import { demoMode } from './demoMode';

const PLAYER = { test: false, demo: false };
const DESKTOP = { reducedMotion: false, coarsePointer: false };

describe('demoMode', () => {
  it('plays in full for a player on a desktop', () => {
    expect(demoMode(PLAYER, DESKTOP)).toBe('full');
  });

  it('plays lighter on a phone (a coarse pointer)', () => {
    expect(demoMode(PLAYER, { ...DESKTOP, coarsePointer: true })).toBe('lite');
  });

  it('holds a still frame with reduced motion, phone or not', () => {
    expect(demoMode(PLAYER, { ...DESKTOP, reducedMotion: true })).toBe('still');
    expect(demoMode(PLAYER, { reducedMotion: true, coarsePointer: true })).toBe('still');
  });

  it('is off in test mode, so e2e see a flat background', () => {
    expect(demoMode({ test: true, demo: false }, DESKTOP)).toBe('off');
  });

  it('plays in test mode with ?demo=1', () => {
    expect(demoMode({ test: true, demo: true }, DESKTOP)).toBe('full');
    expect(demoMode({ test: true, demo: true }, { ...DESKTOP, reducedMotion: true })).toBe('still');
  });
});

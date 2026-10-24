import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from '../data/version';
import { showVersion } from './version';

describe('showVersion', () => {
  it('writes the labelled game version into the overlay element', () => {
    const el = { textContent: '' };
    showVersion(el);
    expect(el.textContent).toBe(`v${GAME_VERSION}`);
  });
});

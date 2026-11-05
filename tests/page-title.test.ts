import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_TITLE } from '../src/ui/gameTitle';

describe('index.html', () => {
  it('page title is the game title', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`<title>${GAME_TITLE}</title>`);
  });
});

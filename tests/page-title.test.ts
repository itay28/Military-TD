import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('index.html', () => {
  it('page title is Hold the Perimeter', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/<title>Hold the Perimeter<\/title>/);
  });
});

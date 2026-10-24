import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_VERSION, versionLabel } from './version';

describe('version', () => {
  it('GAME_VERSION is the package.json version, injected at build time', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
    expect(GAME_VERSION).toBe(pkg.version);
  });

  it('labels a version with a leading v', () => {
    expect(versionLabel('0.3.1')).toBe('v0.3.1');
  });
});

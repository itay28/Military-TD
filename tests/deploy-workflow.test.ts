import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the itch.io deploy (ADR-0005) so an edit can't silently stop releases reaching the page.
const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const deploy = read('.github/workflows/deploy.yml');
const release = read('.github/workflows/release-please.yml');
const runs = [...deploy.matchAll(/^\s+run: (.+)$/gm)].map((m) => m[1]);

describe('deploy workflow', () => {
  it('can be called by the release workflow or run by hand, for a given tag', () => {
    expect(deploy).toMatch(/^on:\n {2}workflow_call:\n {4}inputs:\n {6}tag:\n/m);
    expect(deploy).toMatch(/^ {2}workflow_dispatch:\n {4}inputs:\n {6}tag:\n/m);
  });

  it('builds the tagged commit and checks it fits itch.io before pushing', () => {
    expect(deploy).toContain('ref: ${{ inputs.tag }}');
    const order = ['npm ci', 'npm run build', 'node scripts/itch-build.ts dist'].map((cmd) => runs.indexOf(cmd));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(runs.findIndex((r) => r?.startsWith('butler push'))).toBeGreaterThan(order[2]!);
  });

  it('pushes dist to the html5 channel with the release version', () => {
    expect(runs).toContain('butler push dist "$ITCH_USER/$ITCH_GAME:html5" --userversion "$VERSION"');
    expect(deploy).toContain('ITCH_USER: ${{ vars.ITCH_USER }}');
    expect(deploy).toContain('ITCH_GAME: ${{ vars.ITCH_GAME }}');
  });

  it('passes the API key through env, never into a run line', () => {
    expect(deploy).toContain('BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}');
    expect(runs.some((r) => r?.includes('secrets.'))).toBe(false);
  });
});

describe('release workflow', () => {
  it('deploys only when release-please created a release, passing its tag', () => {
    expect(release).toMatch(
      / {2}deploy:\n(?: {4}.*\n)*? {4}needs: release-please\n {4}if: needs\.release-please\.outputs\.release_created == 'true'\n {4}uses: \.\/\.github\/workflows\/deploy\.yml\n {4}with:\n {6}tag: \$\{\{ needs\.release-please\.outputs\.tag_name \}\}\n {4}secrets: inherit\n/,
    );
  });
});

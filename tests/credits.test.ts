import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderCredits, type Manifest, type ManifestEntry } from '../scripts/credits';

const towerDefense: ManifestEntry = {
  id: 'kenney-tower-defense',
  name: 'Tower Defense (Top-Down)',
  author: 'Kenney',
  source: 'https://kenney.nl/assets/tower-defense-top-down',
  license: 'CC0-1.0',
  attribution: 'Tower Defense (Top-Down) by Kenney (kenney.nl), CC0',
  downloaded: '2026-10-27',
  files: ['assets/kenney-tower-defense/**'],
};

const font: ManifestEntry = {
  id: 'some-font',
  name: 'Some Font',
  author: 'A Type Foundry',
  source: 'https://example.com/some-font',
  license: 'OFL-1.1',
  attribution: '',
  downloaded: '2026-10-28',
  files: ['assets/some-font/**'],
};

// CREDITS.md is generated from assets/manifest.json (docs/assets.md), so it can't drift from the packs we ship.
describe('renderCredits', () => {
  it('renders a heading and one section per pack, in manifest order', () => {
    const credits = renderCredits({ packs: [towerDefense, font] });
    expect(credits.startsWith('# Credits\n')).toBe(true);
    const headings = credits.split('\n').filter((line) => line.startsWith('## '));
    expect(headings).toEqual(['## Tower Defense (Top-Down)', '## Some Font']);
  });

  it('shows each pack’s author, source link, SPDX license and attribution', () => {
    const credits = renderCredits({ packs: [towerDefense] });
    expect(credits).toContain('- Author: Kenney');
    expect(credits).toContain('- Source: <https://kenney.nl/assets/tower-defense-top-down>');
    expect(credits).toContain('- License: CC0-1.0');
    expect(credits).toContain('- Attribution: Tower Defense (Top-Down) by Kenney (kenney.nl), CC0');
    expect(credits).toContain('- Files: `assets/kenney-tower-defense/**`');
  });

  it('leaves out the attribution line when a pack has none', () => {
    const credits = renderCredits({ packs: [font] });
    expect(credits).not.toContain('Attribution');
  });

  it('says so when there are no packs, and ends with one newline', () => {
    const credits = renderCredits({ packs: [] });
    expect(credits).toContain('No third-party assets yet.');
    expect(credits.endsWith('\n')).toBe(true);
    expect(credits.endsWith('\n\n')).toBe(false);
  });
});

// A sanity check on the committed data. Full enforcement (every file covered, allowlist, CREDITS up to date) is #60.
describe('assets/manifest.json', () => {
  const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as Manifest;

  it('has an entry with every documented field for each pack', () => {
    expect(manifest.packs.length).toBeGreaterThan(0);
    for (const pack of manifest.packs) {
      expect(Object.keys(pack).sort()).toEqual(
        ['attribution', 'author', 'downloaded', 'files', 'id', 'license', 'name', 'source'].sort(),
      );
      expect(pack.downloaded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pack.files).toEqual([`assets/${pack.id}/**`]);
    }
  });

  it.each([
    'kenney-tower-defense',
    'kenney-top-down-tanks',
    'kenney-ui-pack',
    'kenney-top-down-shooter',
    'spriteattack-topdown-extras',
    'morgan3d-chopper',
  ])('%s has a License.txt', (id) => {
    expect(manifest.packs.map((pack) => pack.id)).toContain(id);
    expect(existsSync(`assets/${id}/License.txt`)).toBe(true);
  });

  it('CREDITS.md is what renderCredits makes from it', () => {
    expect(readFileSync('CREDITS.md', 'utf8')).toBe(renderCredits(manifest));
  });
});

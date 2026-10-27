import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkAssets, globToRegExp, listAssetFiles } from '../scripts/check-assets';
import { renderCredits, type Manifest, type ManifestEntry } from '../scripts/credits';

const pack: ManifestEntry = {
  id: 'kenney-tower-defense',
  name: 'Tower Defense (Top-Down)',
  author: 'Kenney',
  source: 'https://kenney.nl/assets/tower-defense-top-down',
  license: 'CC0-1.0',
  attribution: 'Tower Defense (Top-Down) by Kenney (kenney.nl), CC0',
  downloaded: '2026-10-27',
  files: ['assets/kenney-tower-defense/**'],
};
const files = ['assets/kenney-tower-defense/License.txt', 'assets/kenney-tower-defense/a.png'];

function run(packs: ManifestEntry[], fs: string[] = files, credits?: string): string[] {
  const manifest: Manifest = { packs };
  return checkAssets({ manifest, files: fs, credits: credits ?? renderCredits(manifest) });
}

// CI fails on assets we can't trace to a source and an allowed license (docs/assets.md).
describe('checkAssets', () => {
  it('passes a covered pack with an allowed license, a license file and fresh credits', () => {
    expect(run([pack])).toEqual([]);
  });

  it('names a file that no manifest entry covers, and the fix', () => {
    const errors = run([pack], [...files, 'assets/stray/b.png']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('assets/stray/b.png');
    expect(errors[0]).toContain('assets/manifest.json');
  });

  it('rejects a license that is not on the allowlist, naming the entry', () => {
    const errors = run([{ ...pack, license: 'CC-BY-SA-4.0' }]);
    expect(errors.some((e) => e.includes('kenney-tower-defense') && e.includes('CC-BY-SA-4.0'))).toBe(true);
  });

  it('requires an attribution for CC-BY and accepts it when present', () => {
    expect(run([{ ...pack, license: 'CC-BY-4.0', attribution: '' }]).join('\n')).toContain('attribution');
    expect(run([{ ...pack, license: 'CC-BY-3.0' }])).toEqual([]);
  });

  it('allows OFL-1.1 for font files only', () => {
    const ofl = { ...pack, license: 'OFL-1.1', attribution: '' };
    expect(run([ofl]).join('\n')).toContain('OFL-1.1');
    const fontFiles = ['assets/kenney-tower-defense/OFL.txt', 'assets/kenney-tower-defense/f.ttf'];
    expect(run([ofl], fontFiles)).toEqual([]);
  });

  it('fails when a pack folder has no license file', () => {
    const errors = run([pack], ['assets/kenney-tower-defense/a.png']);
    expect(errors.some((e) => e.includes('kenney-tower-defense') && /licen[cs]e file/i.test(e))).toBe(true);
  });

  it('fails when CREDITS.md is out of date, pointing at npm run credits', () => {
    const errors = run([pack], files, 'old credits\n');
    expect(errors.some((e) => e.includes('CREDITS.md') && e.includes('npm run credits'))).toBe(true);
  });
});

describe('globToRegExp', () => {
  it('matches ** across folders and * within one', () => {
    expect(globToRegExp('assets/a/**').test('assets/a/b/c.png')).toBe(true);
    expect(globToRegExp('assets/a/*.png').test('assets/a/b/c.png')).toBe(false);
    expect(globToRegExp('assets/a/*.png').test('assets/a/c.png')).toBe(true);
  });

  it('lets **/ match zero folders, like gitignore', () => {
    expect(globToRegExp('assets/a/**/*.png').test('assets/a/c.png')).toBe(true);
    expect(globToRegExp('assets/a/**/*.png').test('assets/a/b/c/d.png')).toBe(true);
    expect(globToRegExp('assets/a/**/*.png').test('assets/ab/c.png')).toBe(false);
  });
});

describe('the committed assets', () => {
  it('pass the check', () => {
    const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as Manifest;
    const credits = readFileSync('CREDITS.md', 'utf8');
    expect(checkAssets({ manifest, files: listAssetFiles('assets'), credits })).toEqual([]);
  });
});

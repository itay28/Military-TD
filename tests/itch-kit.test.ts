import { existsSync, readFileSync, statSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { ENEMY_NAMES, TOWER_NAMES } from '../src/data/display';
import { NOT_PLAYABLE_KINDS, type EnemyKind } from '../src/data/enemies';
import { BUILD_KINDS } from '../src/data/towers';
import { GAME_TITLE } from '../src/ui/gameTitle';
import { KEY_MAP } from '../src/ui/keymap';
import { GIF, GIF_MAX_BYTES, KIT_DIR, KIT_FILES, KIT_MAPS } from './itch/shots';

// The itch.io page kit (#374): the files the maintainer pastes into the Restricted page.
const read = (path: string) => readFileSync(path, 'utf8');

/** A PNG's or GIF's size from its header. */
function imageSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  if (path.endsWith('.gif')) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  const { width, height } = PNG.sync.read(bytes);
  return { width, height };
}

describe('itch.io page kit images', () => {
  it.each(KIT_FILES.map((f) => [f.file, f] as const))('%s is there at its size', (_, { file, width, height }) => {
    const path = `${KIT_DIR}/${file}`;
    expect(existsSync(path), `${path} is missing: run npm run itch:shots`).toBe(true);
    expect(imageSize(path)).toEqual({ width, height });
  });

  it('the GIF is animated and under about 3 MB', () => {
    const path = `${KIT_DIR}/${GIF.file}`;
    expect(read(path).slice(0, 6)).toBe('GIF89a');
    expect(statSync(path).size).toBeLessThan(GIF_MAX_BYTES);
    // More than one image descriptor after the header: frames, not a still.
    expect(readFileSync(path).filter((b, i, all) => b === 0x2c && all[i - 1] === 0x00).length).toBeGreaterThan(10);
  });
});

describe('page.md', () => {
  const page = read(`${KIT_DIR}/page.md`);

  it('has the tagline, description, controls, credits and tags sections', () => {
    for (const heading of ['Tagline', 'Description', 'Controls', 'Credits', 'Tags'])
      expect(page).toMatch(new RegExp(`^## ${heading}$`, 'm'));
  });

  it(`names the game ${GAME_TITLE} and says the page stays Restricted`, () => {
    expect(page).toContain(`# ${GAME_TITLE}`);
    expect(page).toContain('Restricted');
  });

  it('names every tower in play, every enemy in play and every map', () => {
    for (const kind of BUILD_KINDS) expect(page).toContain(TOWER_NAMES[kind]);
    const enemies = (Object.keys(ENEMY_NAMES) as EnemyKind[]).filter((kind) => !NOT_PLAYABLE_KINDS.includes(kind));
    for (const kind of enemies) expect(page).toContain(ENEMY_NAMES[kind]);
    for (const { name } of KIT_MAPS) expect(page).toContain(name);
  });

  it('lists every keyboard shortcut, mouse and touch', () => {
    const controls = page.slice(page.indexOf('## Controls'), page.indexOf('## Credits'));
    for (const { label, description } of KEY_MAP) expect(controls).toContain(`| ${label} | ${description} |`);
    expect(controls).toMatch(/Mouse/);
    expect(controls).toMatch(/Touch/);
  });

  it('points to CREDITS.md', () => {
    expect(page).toContain('CREDITS.md');
  });
});

describe('README.md checklist', () => {
  const readme = read(`${KIT_DIR}/README.md`);

  it('names every kit file, page.md and the capture command', () => {
    for (const { file } of KIT_FILES) expect(readme).toContain(file);
    expect(readme).toContain('page.md');
    expect(readme).toContain('npm run itch:shots');
  });

  it('is a checklist', () => {
    expect(readme).toMatch(/^- \[ \] /m);
  });
});

describe('capture runs on demand only', () => {
  const workflow = read('.github/workflows/itch-shots.yml');

  it('the itch-shots workflow runs only by hand', () => {
    const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\njobs:'));
    expect(on).toContain('workflow_dispatch');
    expect(on).not.toMatch(/pull_request|push:|schedule/);
    expect(workflow).toContain('npm run itch:shots');
  });

  it('CI and the e2e config leave tests/itch alone', () => {
    expect(read('.github/workflows/ci.yml')).not.toContain('itch:shots');
    expect(read('playwright.config.ts')).toContain("testDir: 'tests/e2e'");
    expect(JSON.parse(read('package.json')).scripts['itch:shots']).toContain('playwright.itch.config.ts');
  });
});

describe('ADR-0005', () => {
  it('has an Updated note: the page stays Restricted at 1.0', () => {
    const adr = read('docs/adr/0005-host-on-itch-io.md');
    expect(adr).toMatch(/Updated 2026-11-\d\d.*Restricted at 1\.0/s);
  });
});

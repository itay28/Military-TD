import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { format } from 'prettier';
import {
  autoResolve,
  cleanEnv,
  formatManifest,
  mergeGlossary,
  mergeKeyed,
  mergeManifest,
  ruleFor,
} from '../scripts/auto-resolve.ts';
import { renderCredits, type Manifest, type ManifestEntry } from '../scripts/credits.ts';

const pack = (id: string, over: Partial<ManifestEntry> = {}): ManifestEntry => ({
  id,
  name: `Pack ${id}`,
  author: 'Someone',
  source: `https://example.com/${id}`,
  license: 'CC0-1.0',
  attribution: '',
  downloaded: '2026-11-01',
  files: [`assets/${id}/**`],
  ...over,
});
const manifest = (...packs: ManifestEntry[]) => formatManifest({ packs });
const ids = (text: string) => (JSON.parse(text) as Manifest).packs.map((p) => p.id);

describe('ruleFor', () => {
  it('knows the generated and append-only files', () => {
    expect(ruleFor('CREDITS.md')).toBe('credits');
    expect(ruleFor('assets/manifest.json')).toBe('manifest');
    expect(ruleFor('GLOSSARY.md')).toBe('glossary');
    expect(ruleFor('tests/e2e/screenshots.spec.ts-snapshots/rendered.png')).toBe('baseline');
  });

  it('leaves code, aria snapshots and other PNGs to an agent', () => {
    expect(ruleFor('src/sim/game.ts')).toBeNull();
    expect(ruleFor('tests/e2e/ariaSnapshots.spec.ts-snapshots/credits.aria.yml')).toBeNull();
    expect(ruleFor('assets/render-us-jeep/us-jeep.png')).toBeNull();
    expect(ruleFor('docs/CREDITS.md')).toBeNull();
  });
});

describe('mergeKeyed', () => {
  const key = (s: string) => s.split('=')[0]!;

  it("keeps both sides' additions, theirs after the entry before it on their side", () => {
    expect(mergeKeyed(['a', 'c'], ['a', 'b', 'c'], ['a', 'c', 'd'], key)).toEqual({
      ok: true,
      items: ['a', 'b', 'c', 'd'],
    });
    expect(mergeKeyed(['a', 'c'], ['a', 'c', 'x'], ['a', 'b', 'c'], key)).toEqual({
      ok: true,
      items: ['a', 'b', 'c', 'x'],
    });
  });

  it('takes a change or a delete made on one side only', () => {
    expect(mergeKeyed(['a=1', 'b=1'], ['a=1', 'b=1'], ['a=2'], key)).toEqual({ ok: true, items: ['a=2'] });
    expect(mergeKeyed(['a=1', 'b=1'], ['a=2'], ['a=1', 'b=1'], key)).toEqual({ ok: true, items: ['a=2'] });
  });

  it('keeps an entry both sides added the same way once', () => {
    expect(mergeKeyed([], ['n=1'], ['n=1'], key)).toEqual({ ok: true, items: ['n=1'] });
  });

  it('clashes when both sides changed or added the same key differently', () => {
    expect(mergeKeyed(['a=1'], ['a=2'], ['a=3'], key)).toEqual({ ok: false, clash: 'a' });
    expect(mergeKeyed([], ['n=1'], ['n=2'], key)).toEqual({ ok: false, clash: 'n' });
    expect(mergeKeyed(['a=1'], [], ['a=3'], key)).toEqual({ ok: false, clash: 'a' });
  });
});

describe('mergeManifest', () => {
  it("keeps both sides' new packs", () => {
    const merged = mergeManifest(
      manifest(pack('a')),
      manifest(pack('a'), pack('ours')),
      manifest(pack('a'), pack('theirs')),
    );
    expect(merged.ok && ids(merged.text)).toEqual(['a', 'ours', 'theirs']);
  });

  it('aborts on the same id with different values', () => {
    const merged = mergeManifest(
      manifest(pack('a')),
      manifest(pack('a'), pack('new', { license: 'CC0-1.0' })),
      manifest(pack('a'), pack('new', { license: 'CC-BY-4.0' })),
    );
    expect(merged).toEqual({ ok: false, clash: 'new' });
  });

  it('merges with no common ancestor too (both added the file)', () => {
    const merged = mergeManifest(null, manifest(pack('a')), manifest(pack('b')));
    expect(merged.ok && ids(merged.text)).toEqual(['a', 'b']);
  });

  it("writes prettier's layout, so the merged file passes format:check", async () => {
    const real = readFileSync('assets/manifest.json', 'utf8');
    const long = pack('long', {
      files: Array.from({ length: 8 }, (_, i) => `assets/some-long-pack-name/folder-${i}/**`),
    });
    for (const m of [JSON.parse(real) as Manifest, { packs: [pack('a'), long] }, { packs: [] }]) {
      const text = formatManifest(m);
      expect(text).toBe(await format(text, { parser: 'json', singleQuote: true, printWidth: 120 }));
    }
    expect(formatManifest(JSON.parse(real) as Manifest)).toBe(real);
  });
});

describe('mergeGlossary', () => {
  const head = '# Glossary\n\n| Term | Meaning | Avoid |\n| --- | --- | --- |\n';
  const row = (term: string, meaning = `${term} meaning`) => `| **${term}** | ${meaning} | |\n`;

  it("keeps both sides' new terms", () => {
    const base = head + row('Tile') + row('Path');
    const merged = mergeGlossary(base, head + row('Tile') + row('Ours') + row('Path'), base + row('Theirs'));
    expect(merged).toEqual({ ok: true, text: head + row('Tile') + row('Ours') + row('Path') + row('Theirs') });
  });

  it('keys a row by its bold term, so a parenthesised alias stays the same term', () => {
    const base = head + row('Simulation** (sim', 'old');
    const merged = mergeGlossary(base, base, head + row('Simulation** (sim', 'new'));
    expect(merged).toEqual({ ok: true, text: head + row('Simulation** (sim', 'new') });
  });

  it('aborts when both sides edited the same term differently', () => {
    const base = head + row('Tile');
    expect(mergeGlossary(base, head + row('Tile', 'a'), head + row('Tile', 'b'))).toEqual({ ok: false, clash: 'Tile' });
  });

  it('aborts when the text around the table changed on both sides', () => {
    const base = head + row('Tile');
    expect(mergeGlossary(base, '# Terms\n' + base.slice(11), '# Words\n' + base.slice(11)).ok).toBe(false);
  });
});

// Real repositories in a temp dir: a bare "origin", a clone with main and a PR branch, and the
// steward's own checkout that runs autoResolve.
describe('autoResolve', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: cleanEnv(),
    }).trim();
  const write = (cwd: string, files: Record<string, string | Buffer>) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), content);
    }
  };
  const commit = (cwd: string, files: Record<string, string | Buffer>, message: string) => {
    write(cwd, files);
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', message);
  };

  const glossaryHead = '# Glossary\n\n| Term | Meaning | Avoid |\n| --- | --- | --- |\n';
  const png = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, n, 0, 0xff]);
  const baseline = 'tests/e2e/screenshots.spec.ts-snapshots/rendered.png';

  /** origin with `main` and `feat/1-x` that both changed `files` from a shared base. */
  function fixture(ours: Record<string, string | Buffer>, theirs: Record<string, string | Buffer>) {
    const root = mkdtempSync(join(tmpdir(), 'auto-resolve-'));
    dirs.push(root);
    const origin = join(root, 'origin.git');
    const work = join(root, 'work');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'checkout', '-q', '-b', 'main');
    commit(
      work,
      {
        '.gitattributes': '*.png binary\n',
        'assets/manifest.json': manifest(pack('a')),
        'CREDITS.md': renderCredits({ packs: [pack('a')] }),
        'GLOSSARY.md': glossaryHead + '| **Tile** | A cell. | |\n',
        [baseline]: png(0),
        'src/foo.ts': 'export const x = 0;\n',
      },
      'base',
    );
    git(work, 'push', '-q', 'origin', 'main');
    git(work, 'checkout', '-q', '-b', 'feat/1-x');
    commit(work, ours, 'pr change');
    git(work, 'push', '-q', 'origin', 'feat/1-x');
    git(work, 'checkout', '-q', 'main');
    commit(work, theirs, 'main change');
    git(work, 'push', '-q', 'origin', 'main');
    const steward = join(root, 'steward');
    git(root, 'clone', '-q', '--depth', '1', `file://${origin}`, steward);
    return { origin, steward };
  }

  const generatedConflict = () =>
    fixture(
      {
        'assets/manifest.json': manifest(pack('a'), pack('ours')),
        'CREDITS.md': renderCredits({ packs: [pack('a'), pack('ours')] }),
        'GLOSSARY.md': glossaryHead + '| **Tile** | A cell. | |\n| **Ours** | Ours. | |\n',
        [baseline]: png(1),
        'src/foo.ts': 'export const x = 0;\nexport const ours = 1;\n',
      },
      {
        'assets/manifest.json': manifest(pack('a'), pack('theirs')),
        'CREDITS.md': renderCredits({ packs: [pack('a'), pack('theirs')] }),
        'GLOSSARY.md': glossaryHead + '| **Tile** | A cell. | |\n| **Theirs** | Theirs. | |\n',
        [baseline]: png(2),
      },
    );

  it('merges main in with a normal merge commit when only generated files conflict', async () => {
    const { origin, steward } = generatedConflict();
    const mainTip = git(origin, 'rev-parse', 'main');
    const before = git(origin, 'rev-parse', 'feat/1-x');

    const result = await autoResolve({ dir: steward, remote: origin, head: 'feat/1-x', base: 'main' });

    expect(result).toMatchObject({ kind: 'resolved', baselines: true });
    expect(result.kind === 'resolved' && [...result.files].sort()).toEqual(
      ['CREDITS.md', 'GLOSSARY.md', 'assets/manifest.json', baseline].sort(),
    );
    const after = git(origin, 'rev-parse', 'feat/1-x');
    expect(git(origin, 'rev-list', '--parents', '-n', '1', after).split(' ').slice(1)).toEqual([before, mainTip]);
    const show = (path: string) => git(origin, 'show', `${after}:${path}`);
    expect(ids(show('assets/manifest.json'))).toEqual(['a', 'ours', 'theirs']);
    expect(show('CREDITS.md')).toBe(renderCredits({ packs: [pack('a'), pack('ours'), pack('theirs')] }).trim());
    expect(show('GLOSSARY.md')).toContain('**Ours**');
    expect(show('GLOSSARY.md')).toContain('**Theirs**');
    expect(show('src/foo.ts')).toContain('ours = 1');
    expect(git(origin, 'rev-parse', `${after}:${baseline}`)).toBe(git(origin, 'rev-parse', `main:${baseline}`));
    // The steward's own checkout is left as it was.
    expect(git(steward, 'status', '--porcelain')).toBe('');
    expect(git(steward, 'worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('aborts on a code conflict and leaves the branch untouched', async () => {
    const { origin, steward } = fixture(
      { 'src/foo.ts': 'export const x = 1;\n', 'assets/manifest.json': manifest(pack('a'), pack('ours')) },
      { 'src/foo.ts': 'export const x = 2;\n', 'assets/manifest.json': manifest(pack('a'), pack('theirs')) },
    );
    const before = git(origin, 'rev-parse', 'feat/1-x');

    const result = await autoResolve({ dir: steward, remote: origin, head: 'feat/1-x', base: 'main' });

    expect(result).toEqual({ kind: 'aborted', why: 'src/foo.ts has no mechanical rule' });
    expect(git(origin, 'rev-parse', 'feat/1-x')).toBe(before);
    expect(git(steward, 'worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('aborts on a manifest id clash and leaves the branch untouched', async () => {
    const { origin, steward } = fixture(
      { 'assets/manifest.json': manifest(pack('a'), pack('new', { author: 'X' })) },
      { 'assets/manifest.json': manifest(pack('a'), pack('new', { author: 'Y' })) },
    );
    const before = git(origin, 'rev-parse', 'feat/1-x');

    const result = await autoResolve({ dir: steward, remote: origin, head: 'feat/1-x', base: 'main' });

    expect(result).toEqual({ kind: 'aborted', why: 'assets/manifest.json: both sides changed "new"' });
    expect(git(origin, 'rev-parse', 'feat/1-x')).toBe(before);
  });

  it('never writes the remote URL (it holds the token) into a result', async () => {
    const { steward } = generatedConflict();
    const result = await autoResolve({ dir: steward, remote: '/nowhere/secret-token', head: 'feat/1-x', base: 'main' });
    expect(result.kind).toBe('aborted');
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });
});

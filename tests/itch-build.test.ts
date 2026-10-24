import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkItchBuild, ITCH_LIMITS } from '../scripts/itch-build';

// itch.io serves HTML5 games from a zip inside an iframe (ADR-0005); the build must fit its limits.
const GOOD_INDEX = '<script type="module" src="./assets/index-abc.js"></script><link href="./assets/a.css">';

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** Writes `files` (path → contents) into a fresh temp dir and returns it. */
function writeBuild(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'itch-build-'));
  dirs.push(dir);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
}

describe('checkItchBuild', () => {
  it('accepts a build with a root index.html and relative asset paths', () => {
    const dir = writeBuild({ 'index.html': GOOD_INDEX, 'assets/index-abc.js': 'x', 'assets/a.css': 'y' });
    expect(checkItchBuild(dir)).toEqual([]);
  });

  it('reports a missing index.html', () => {
    const dir = writeBuild({ 'game/index.html': GOOD_INDEX });
    expect(checkItchBuild(dir)).toEqual(['No index.html at the root of the build.']);
  });

  it('reports root-absolute src and href in index.html, which break inside the iframe', () => {
    const dir = writeBuild({
      'index.html': `<script src="/assets/index.js"></script><link rel="icon" href='/favicon.ico'>`,
    });
    expect(checkItchBuild(dir)).toEqual([
      'index.html uses a root-absolute path: src="/assets/index.js". Build with Vite base "./".',
      'index.html uses a root-absolute path: href=\'/favicon.ico\'. Build with Vite base "./".',
    ]);
  });

  it('allows full and protocol-relative URLs', () => {
    const dir = writeBuild({
      'index.html': '<link href="https://fonts.googleapis.com/css2"><script src="//cdn.example/x.js"></script>',
    });
    expect(checkItchBuild(dir)).toEqual([]);
  });

  it("uses itch.io's limits: 1000 files, 240-character paths, 200 MB per file, 500 MB in total", () => {
    expect(ITCH_LIMITS).toEqual({ maxFiles: 1000, maxPathLength: 240, maxFileBytes: 200e6, maxTotalBytes: 500e6 });
  });

  it('reports more files than the limit, counting subfolders', () => {
    const dir = writeBuild({ 'index.html': GOOD_INDEX, 'assets/a.js': '', 'assets/deep/b.js': '' });
    expect(checkItchBuild(dir, { ...ITCH_LIMITS, maxFiles: 2 })).toEqual(['The build has 3 files; itch.io allows 2.']);
  });

  it('reports each file over the per-file limit and a total over the overall limit', () => {
    const dir = writeBuild({
      'index.html': GOOD_INDEX,
      'assets/big.js': 'x'.repeat(100),
      'assets/ok.js': 'x'.repeat(60),
    });
    const total = GOOD_INDEX.length + 160;
    expect(checkItchBuild(dir, { ...ITCH_LIMITS, maxFileBytes: 99, maxTotalBytes: 150 })).toEqual([
      'assets/big.js is 100 bytes; itch.io allows 99 per file.',
      `The build is ${total} bytes; itch.io allows 150 in total.`,
    ]);
  });

  it('reports a path longer than the limit', () => {
    const dir = writeBuild({ 'index.html': GOOD_INDEX, 'assets/abcdef.js': '', 'assets/abc.js': '' });
    expect(checkItchBuild(dir, { ...ITCH_LIMITS, maxPathLength: 14 })).toEqual([
      'assets/abcdef.js is 16 characters long; itch.io allows 14 per path.',
    ]);
  });
});

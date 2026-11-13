import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Playwright loads specs with Babel, not Vite: a `?raw` import (the .tmj maps in src/data/maps.ts) fails to parse
// and the run finds "No tests found" (#580). So nothing a Playwright spec imports may reach src/data/maps.ts.

const ROOT = resolve(__dirname, '..');
const MAPS = join(ROOT, 'src/data/maps.ts');
// Type-only imports are erased, so they don't count.
const IMPORT =
  /(?:^|\n)\s*(?:import|export)\b(?!\s+type\b)[^;'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function resolveImport(from: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(dirname(from), spec);
  return [base, `${base}.ts`, join(base, 'index.ts')].find((p) => p.endsWith('.ts') && existsSync(p));
}

/** The import chain from `file` to src/data/maps.ts, or undefined if it isn't reached. */
export function chainToMaps(file: string, seen = new Set<string>()): string[] | undefined {
  if (file === MAPS) return [file];
  if (seen.has(file)) return undefined;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(IMPORT)) {
    const target = resolveImport(file, (m[1] ?? m[2])!);
    const chain = target && chainToMaps(target, seen);
    if (chain) return [file, ...chain];
  }
  return undefined;
}

const rel = (p: string) => p.slice(ROOT.length + 1);

function specsIn(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(ROOT, dir, f));
}

describe('Playwright specs and helpers', () => {
  for (const file of [...specsIn('tests/perf').filter((f) => f.endsWith('.perf.ts')), ...specsIn('tests/e2e')])
    it(`${rel(file)} doesn't import src/data/maps.ts`, () => {
      expect(chainToMaps(file)?.map(rel)).toBeUndefined();
    });

  it('the check finds a chain that does reach the maps', () => {
    expect(chainToMaps(join(ROOT, 'src/sim/heavyLoad.ts'))).toBeDefined();
  });
});

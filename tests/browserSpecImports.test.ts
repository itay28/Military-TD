import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Playwright loads specs with its own Babel loader, not Vite, so a spec that (even indirectly) imports a module
// using a Vite-only feature such as `?raw` finds no tests. `src/data/maps.ts` imports the .tmj maps that way (#581).
const FORBIDDEN = resolve('src/data/maps.ts');

const resolveImport = (from: string, spec: string): string | undefined => {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(dirname(from), spec);
  return [base, `${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p) && statSync(p).isFile());
};

// `import type` is erased before loading, so it can't reach a module.
// A heuristic: it doesn't follow dynamic `import()` or `require`, and it counts `import { type X } from`
// as a runtime import, so it can report a false positive.
const importsOf = (file: string): string[] =>
  [
    ...readFileSync(file, 'utf8').matchAll(
      /^\s*(?:import|export)\s(?!type\s)[^'"]*?from\s+'([^']+)'|^\s*import\s+'([^']+)'/gm,
    ),
  ]
    .map((m) => resolveImport(file, (m[1] ?? m[2])!))
    .filter((p): p is string => p !== undefined);

/** The first import chain from `entry` to FORBIDDEN, or undefined. */
const chainToMaps = (entry: string): string[] | undefined => {
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]): string[] | undefined => {
    if (file === FORBIDDEN) return chain;
    if (seen.has(file)) return undefined;
    seen.add(file);
    for (const next of importsOf(file)) {
      const found = walk(next, [...chain, next]);
      if (found) return found;
    }
    return undefined;
  };
  return walk(entry, [entry]);
};

const specs = ['tests/e2e', 'tests/perf']
  .flatMap((dir) => readdirSync(dir).map((f) => join(dir, f)))
  .filter((f) => /\.(spec|perf)\.ts$/.test(f))
  .map((f) => resolve(f));

describe('browser specs', () => {
  it('finds the specs', () => expect(specs.length).toBeGreaterThan(10));
  it.each(specs)('%s imports nothing that reaches src/data/maps.ts', (spec) => {
    const chain = chainToMaps(spec)?.map((p) => p.replace(`${resolve('.')}/`, ''));
    expect(chain, chain?.join(' -> ')).toBeUndefined();
  });
});

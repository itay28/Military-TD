import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Guards the ADR-0002/0003 lint rules so a config change can't silently drop them.
const eslint = new ESLint();

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

describe('lint rules', () => {
  it('importing phaser from src/sim is a lint error', async () => {
    const ids = await ruleIdsFor("import Phaser from 'phaser';\nexport const x = Phaser;\n", 'src/sim/example.ts');
    expect(ids).toContain('no-restricted-imports');
  });

  it('Math.random and Date.now in src/sim are lint errors', async () => {
    const ids = await ruleIdsFor('export const x = Math.random() + Date.now();\n', 'src/sim/example.ts');
    expect(ids.filter((id) => id === 'no-restricted-properties')).toHaveLength(2);
  });

  it('performance.now in src/sim is a lint error', async () => {
    const ids = await ruleIdsFor('export const x = performance.now();\n', 'src/sim/example.ts');
    expect(ids).toContain('no-restricted-properties');
  });

  it('importing phaser from src/scenes is allowed', async () => {
    const ids = await ruleIdsFor("import Phaser from 'phaser';\nexport const x = Phaser;\n", 'src/scenes/example.ts');
    expect(ids).toEqual([]);
  });
});

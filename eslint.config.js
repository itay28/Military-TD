import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', '.claude/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
  // The Simulation is pure and deterministic (ADR-0002, ADR-0003).
  {
    files: ['src/sim/**/*.{ts,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: 'src/sim must not depend on Phaser (ADR-0002).' }],
          patterns: [{ group: ['phaser/*'], message: 'src/sim must not depend on Phaser (ADR-0002).' }],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts (ADR-0003).' },
        { object: 'Date', property: 'now', message: 'The sim advances only through tick(dtMs) (ADR-0002).' },
        {
          object: 'performance',
          property: 'now',
          message: 'The sim advances only through tick(dtMs) (ADR-0002).',
        },
      ],
    },
  },
  prettier,
);

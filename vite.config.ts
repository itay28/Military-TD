import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  // Relative asset paths: itch.io serves the game inside an iframe from its CDN (ADR-0005).
  base: './',
  // The game shows its version in a corner (ADR-0004); release-please bumps it in package.json.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2023',
    // Phaser alone is about 1.4 MB minified; warn only when the bundle grows well past that.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});

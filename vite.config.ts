import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths: itch.io serves the game inside an iframe from its CDN (ADR-0005).
  base: './',
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

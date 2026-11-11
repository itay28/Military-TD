import { defineConfig } from 'vitest/config';

// The sim budget test (`npm run test:perf`, docs/performance.md): only *.perf.test.ts, one file at a time, so the
// timing isn't shared with other suites. `npm test` leaves these files out.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/perf/**/*.perf.test.ts'],
    fileParallelism: false,
    silent: false,
  },
});

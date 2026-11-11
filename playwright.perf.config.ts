import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The browser frame-time report (`npm run test:perf:browser`, docs/performance.md): one worker and no retries, so
// nothing else competes for the CPU while frames are timed and a slow run isn't hidden by a second try.
export default defineConfig({
  ...base,
  testDir: 'tests/perf',
  testMatch: '**/*.perf.ts',
  workers: 1,
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
});

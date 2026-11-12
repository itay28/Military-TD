import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The itch.io page kit's capture (#374): `npm run itch:shots`. Its own test dir, so e2e runs never pick it up, and
// it runs in CI only by hand (.github/workflows/itch-shots.yml). It writes docs/itch/; it asserts nothing.
export default defineConfig({
  ...base,
  testDir: 'tests/itch',
  testMatch: '**/*.spec.ts',
  // One game at a time: the GIF's frame timing needs the machine to itself.
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  reporter: 'list',
  use: { ...base.use, trace: 'off', screenshot: 'off' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

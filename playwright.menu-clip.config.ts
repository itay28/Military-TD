import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// The menu clip's recording (`npm run menu:clip`, #568): one long test that steps the clip frame by frame and encodes
// the video behind the Main menu. Started on demand only, never on every CI run. Needs ffmpeg.
export default defineConfig({
  ...base,
  testDir: 'tests/menu-clip',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60 * 60 * 1000,
  reporter: 'list',
  use: { ...base.use, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, trace: 'off' },
  projects: [{ name: 'chromium', use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } }],
});

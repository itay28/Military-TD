import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// UI tests against the built game in headless Chromium (ADR-0003). `npm run test:e2e`.
export default defineConfig({
  testDir: 'tests/e2e',
  // Specs are *.spec.ts, so Vitest (which runs *.test.ts) leaves them alone.
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Baselines are made and compared only in CI's Linux container, so one name per screenshot, no platform suffix.
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The 768 × 480 canvas plus the HUD bar and margins, as in workflow.md → 4b.
    viewport: { width: 900, height: 560 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 560 } } }],
  webServer: {
    // Always a fresh build: a server left over from another run would serve stale code.
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

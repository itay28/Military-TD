import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

// Fonts and GPU rendering differ between machines, so baselines are made and compared only in CI's Linux
// container (ADR-0003). To make or update one, see docs/agents/workflow.md → Screenshot baselines.
test.skip(!process.env['CI'], 'Screenshot baselines are compared in the CI container only');

test('initial map', async ({ page }) => {
  await openGame(page);
  // The version label changes with every release.
  await expect(page).toHaveScreenshot('initial-map.png', { mask: [page.locator('#version')] });
});

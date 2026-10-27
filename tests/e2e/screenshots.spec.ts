import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

// Fonts and GPU rendering differ between machines, so baselines are made and compared only in CI's Linux
// container (ADR-0003). To make or update one, see docs/agents/workflow.md → Screenshot baselines.
test.skip(!process.env['CI'], 'Screenshot baselines are compared in the CI container only');

test('map', async ({ page }) => {
  await openGame(page);
  // The canvas only: the HUD and build bar are DOM and covered by aria snapshots (ariaSnapshots.spec.ts).
  await expect(page.locator('#game')).toHaveScreenshot('map.png');
});

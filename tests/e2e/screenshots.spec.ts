import { expect, test, type Page } from '@playwright/test';
import { openGame, view } from './helpers';

// Fonts and GPU rendering differ between machines, so baselines are made and compared only in CI's Linux
// container (ADR-0003). To make or update one, see docs/agents/workflow.md → Screenshot baselines.
test.skip(!process.env['CI'], 'Screenshot baselines are compared in the CI container only');

/**
 * The DOM that hangs over the canvas (Sniper intel, #353) is hidden, so these baselines change only when map drawing
 * does; the HUD's look is covered by aria snapshots and the PR screenshots.
 */
const hideOverlays = (page: Page) =>
  page.addStyleTag({ content: '#hud .hud-intel { visibility: hidden !important; }' });

test('map', async ({ page }) => {
  await openGame(page);
  // The canvas only: the HUD and build bar are DOM and covered by aria snapshots (ariaSnapshots.spec.ts).
  await hideOverlays(page);
  await expect(page.locator('#game')).toHaveScreenshot('map.png');
});

test('rendered sprites: every tower and a Tank on the map (ADR-0009, #567)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('every-tower-kind'));
  await page.evaluate(() => window.__TD__!.command({ type: 'spawnEnemy', kind: 'tank' }));
  await page.evaluate(() => window.__TD__!.step(240));
  await expect
    .poll(async () => (await view(page)).rendered)
    .toEqual(['aaGun', 'cannon', 'grenadeLauncher', 'mortar', 'rifleNest', 'sniper', 'tank']);
  await hideOverlays(page);
  await expect(page.locator('#game')).toHaveScreenshot('rendered.png');
});

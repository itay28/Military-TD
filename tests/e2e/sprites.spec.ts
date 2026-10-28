import { expect, test } from '@playwright/test';
import { openGame, stepToEnd, view } from './helpers';

const LAYERS = ['map', 'towers', 'enemies'];

/** Loads a one-tower game and steps into its wave until the enemy is drawn. */
async function startWave(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await page.evaluate(() => window.__TD__!.step(10));
  // Enemy views are made on the next frame, so wait for one.
  await expect.poll(async () => (await view(page)).drawOrder).toContain('enemies');
}

test('the atlas loads: sprites on, same draw order, the game plays to Victory', async ({ page }) => {
  await openGame(page);
  await startWave(page);
  const { sprites, drawOrder } = await view(page);
  expect(sprites).toBe(true);
  expect(drawOrder.filter((layer) => LAYERS.includes(layer))).toEqual(LAYERS);
  expect((await stepToEnd(page)).phase).toBe('victory');
});

test('a blocked atlas falls back to shapes and never breaks the game', async ({ page }) => {
  const blocked: string[] = [];
  await page.route(/\/sprites[^/]*\.(png|json)$/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  await openGame(page);
  expect(blocked.length).toBeGreaterThan(0);
  await startWave(page);
  const { sprites, drawOrder } = await view(page);
  expect(sprites).toBe(false);
  expect(drawOrder.filter((layer) => LAYERS.includes(layer))).toEqual(LAYERS);
  expect((await stepToEnd(page)).phase).toBe('victory');
});

import { expect, test } from '@playwright/test';
import { openGame, stepToEnd } from './helpers';

test('a win with one Life lost shows 2 of 3 stars and saves them as the map’s progress', async ({ page }) => {
  await openGame(page, { persist: true });
  // One Infantry leaks on the MVP map: Victory with 19 of 20 Lives.
  await page.evaluate(() => window.__TD__!.loadScenario('single-infantry-leaks'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  const end = await stepToEnd(page);
  expect(end.phase).toBe('victory');
  expect(end.lives).toBe(19);

  await expect(page.getByTestId('stars')).toHaveText('★★☆ 2 of 3 stars');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('military-td.progress') ?? 'null'));
  expect(saved).toEqual({ version: 1, progress: { maps: { mvp: { completed: true, bestStars: 2 } } } });
});

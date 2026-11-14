import { expect, test } from '@playwright/test';
import { clickTile, openGame, state } from './helpers';

const TILE = { col: 2, row: 3 };

test('the Sniper is on the build bar under key 5: build it and upgrade it to level 3 (#364)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('every-tower-kind'));
  await expect(page.getByTestId('build-sniper')).toBeVisible();
  await page.keyboard.press('5');
  await expect(page.getByTestId('build-sniper')).toHaveAttribute('aria-pressed', 'true');
  await clickTile(page, TILE);
  expect((await state(page)).towers.filter((t) => t.kind === 'sniper')).toHaveLength(2);
  await clickTile(page, TILE);
  await expect(page.getByRole('dialog', { name: 'Sniper' })).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.getByTestId('tower-level')).toHaveText('Level 2');
  await page.keyboard.press('u');
  await expect(page.getByTestId('tower-level')).toHaveText('Level 3');
  expect((await state(page)).towers.find((t) => t.tile.col === TILE.col && t.tile.row === TILE.row)).toMatchObject({
    level: 3,
  });
});

import { expect, test, type Page } from '@playwright/test';
import { START_MONEY } from '../../src/data/start';
import { TOWER_STATS } from '../../src/data/towers';
import { clickTile, openGame, state } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };
const EMPTY = { col: 5, row: 4 };

const panel = (page: Page) => page.getByRole('dialog', { name: 'Rifle Nest' });

/** Places a Rifle Nest beside the Path, then clicks it. */
async function selectPlacedTower(page: Page) {
  await openGame(page);
  await clickTile(page, BESIDE_PATH);
  await clickTile(page, BESIDE_PATH);
}

test('clicking a placed tower opens its panel instead of refusing the tile', async ({ page }) => {
  await selectPlacedTower(page);
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId('tower-damage')).toHaveText(String(TOWER_STATS.rifleNest.damage));
  expect((await state(page)).towers).toHaveLength(1);
});

test('Upgrade raises the tower to level 2 and spends its cost', async ({ page }) => {
  await selectPlacedTower(page);
  await panel(page).getByRole('button', { name: 'Optics (40)' }).click();
  await expect(page.getByTestId('tower-level')).toHaveText('Level 2');
  await expect(panel(page).getByRole('button', { name: 'Heavier weapon (70)' })).toBeVisible();
  expect(await state(page)).toMatchObject({
    towers: [{ level: 2 }],
    money: START_MONEY - TOWER_STATS.rifleNest.cost - 40,
  });
});

test('Escape closes the panel', async ({ page }) => {
  await selectPlacedTower(page);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
});

test('the close button closes the panel', async ({ page }) => {
  await selectPlacedTower(page);
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await expect(panel(page)).toBeHidden();
});

test('a click on an empty tile while a tower is selected only deselects', async ({ page }) => {
  await selectPlacedTower(page);
  await expect(panel(page)).toBeVisible();
  await clickTile(page, EMPTY);
  await expect(panel(page)).toBeHidden();
  expect(await state(page)).toMatchObject({
    towers: [{ tile: BESIDE_PATH }],
    money: START_MONEY - TOWER_STATS.rifleNest.cost,
  });
});

test('Restart closes the panel', async ({ page }) => {
  await selectPlacedTower(page);
  await expect(panel(page)).toBeVisible();
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await expect(panel(page)).toBeHidden();
});

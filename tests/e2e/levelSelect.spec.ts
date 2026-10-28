import { expect, test } from '@playwright/test';
import { MAPS } from '../../src/data/maps';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { openLevelSelect, state } from './helpers';

// From #51: Main menu → Play → Level select → Game on the chosen map; Back returns to the Main menu.

const first = MAPS[0]!;

test('the Level select shows each map as a button with a preview, the first focused', async ({ page }) => {
  await openLevelSelect(page);
  await expect(page.getByRole('button', { name: first.name })).toBeFocused();
  await expect(page.getByRole('button', { name: first.name }).locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
});

test('picking a map starts a new game on it, in the Build phase', async ({ page }) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: first.name }).click();

  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(page.getByRole('heading', { name: 'Select map' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start Wave' })).toBeEnabled();
  await expect(page.locator('#build-bar')).toBeVisible();
  await expect(page.getByTestId('hud-money')).toHaveText(`Money ${START_MONEY}`);
  expect(await state(page)).toMatchObject({
    mapId: first.id,
    phase: 'build',
    money: START_MONEY,
    lives: START_LIVES,
    towers: [],
  });
});

test('Back returns to the Main menu', async ({ page }) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page.getByRole('heading', { name: 'Select map' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
});

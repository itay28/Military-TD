import { expect, test } from '@playwright/test';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { openMenu, state } from './helpers';

// From #46: the game opens on the Main menu, and Play starts a new game in the Build phase.

test('a player opening the game sees the Main menu, not the HUD or build bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeDisabled();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#build-bar')).toBeHidden();
  await expect(page.locator('#tower-panel')).toBeHidden();
});

test('Play on the Main menu starts a new game in the Build phase', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Play' }).click();

  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start Wave' })).toBeEnabled();
  await expect(page.locator('#build-bar')).toBeVisible();
  await expect(page.getByTestId('hud-money')).toHaveText(`Money ${START_MONEY}`);
  expect(await state(page)).toMatchObject({ phase: 'build', money: START_MONEY, lives: START_LIVES, towers: [] });
});

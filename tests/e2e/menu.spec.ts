import { expect, test } from '@playwright/test';
import { openMenu } from './helpers';

// From #46: the game opens on the Main menu, and Play leads to a new game (through the Level select, #51).

test('a player opening the game sees the Main menu, not the HUD or build bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeDisabled();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#build-bar')).toBeHidden();
});

test('Play on the Main menu opens the Level select', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Play' }).click();

  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Select map' })).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#build-bar')).toBeHidden();
});

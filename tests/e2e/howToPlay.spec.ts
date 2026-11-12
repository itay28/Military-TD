import { expect, test } from '@playwright/test';
import { openGame, openMenu } from './helpers';

// #382: the How to play screen, opened from the Main menu and the pause menu, closed with Back or Esc.
// #571: its sections come in the order the player meets them, in the HUD's words.

const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'How to play' });

test('How to play on the Main menu opens the screen; Esc and Back return to the menu', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protect HQ' })).toBeVisible();
  await expect(dialog(page).getByRole('heading', { level: 3 })).toHaveText([
    'Protect HQ',
    'Placing towers',
    'Funds',
    'Upgrading and selling',
    'Ground, air and armor',
    'Waves',
    'Towers',
    'Enemies',
    'Keys',
  ]);
  await expect(dialog(page)).toContainText('HQ starts at 20 on Normal, 15 on Hard.');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'How to play' })).toBeFocused();

  await page.getByRole('button', { name: 'How to play' }).click();
  await dialog(page).getByRole('button', { name: 'Back' }).click();
  await expect(dialog(page)).toBeHidden();
});

test('How to play on the pause menu opens the screen; Esc returns to the paused game', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protect HQ' })).toBeVisible();
  await expect(dialog(page)).toContainText('HQ starts at 20.');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
});

test('on a phone the screen scrolls on its own and Back stays in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMenu(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  const body = page.locator('.how-to-play-body');
  expect(await body.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await page.getByRole('heading', { name: 'Keys' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Keys' })).toBeInViewport();
  expect(await body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await expect(dialog(page).getByRole('button', { name: 'Back' })).toBeInViewport();
});

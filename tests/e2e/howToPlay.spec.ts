import { expect, test } from '@playwright/test';
import { openGame, openMenu } from './helpers';

// #382: the How to play screen, opened from the Main menu and the pause menu, closed with Back or Esc.

const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'How to play' });

test('How to play on the Main menu opens the screen; Esc and Back return to the menu', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The goal' })).toBeVisible();
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
  await expect(dialog(page).getByRole('button', { name: 'Back' })).toBeInViewport();
});

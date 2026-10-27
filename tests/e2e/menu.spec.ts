import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openMenu } from './helpers';

const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as {
  packs: { name: string; source: string; attribution: string }[];
};

// From #46: the game opens on the Main menu, and Play starts a new game (through the Level select, #51).

test('a player opening the game sees the Main menu, not the HUD or build bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeDisabled();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#build-bar')).toBeHidden();
  await expect(page.locator('#tower-panel')).toBeHidden();
});

test('Play on the Main menu opens the Level select', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Play' }).click();

  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Select map' })).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await expect(page.locator('#build-bar')).toBeHidden();
});

// From #61: Credits lists every asset pack from the manifest, with a Back button to the menu.

test('Credits on the Main menu lists every pack from the manifest, and Back returns to the menu', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Credits' }).click();

  await expect(page.getByRole('heading', { name: 'Credits' })).toBeVisible();
  for (const pack of manifest.packs) {
    await expect(page.getByRole('heading', { name: pack.name })).toBeVisible();
    if (pack.attribution) await expect(page.getByText(pack.attribution, { exact: true })).toBeVisible();
    const link = page.getByRole('link', { name: pack.source });
    await expect(link).toHaveAttribute('href', pack.source);
    await expect(link).toHaveAttribute('target', '_blank');
  }
  await expect(page.getByRole('button', { name: 'Play' })).toBeHidden();
  await expect(page.locator('#hud')).toBeHidden();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Credits' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Credits' })).toBeHidden();
});

test('the Credits screen fits the window: the page does not scroll sideways and Back stays on screen', async ({
  page,
}) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Credits' }).click();
  const back = page.getByRole('button', { name: 'Back' });
  await expect(back).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

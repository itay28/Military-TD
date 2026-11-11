import { expect, test, type Page } from '@playwright/test';
import { FIRST_MAP } from './firstMap';
import { openMenu, state } from './helpers';

// From #402: a live battlefield plays behind the Main menu, the Level select, Settings and Credits; the menu works
// over it, and a real game turns it off. Test mode shows a flat background unless ?demo=1.

const root = (page: Page) => page.locator('html');

test('without ?demo=1 test mode shows the menu on a flat background, with no demo', async ({ page }) => {
  await openMenu(page);
  await expect(root(page)).not.toHaveAttribute('data-demo');
  await expect(page.locator('#menu')).toHaveCSS('background-color', 'rgb(27, 30, 22)');
});

test('with ?demo=1 the battle plays behind a see-through menu, and the camera pans', async ({ page }) => {
  await openMenu(page, { demo: true });
  await expect(root(page)).toHaveAttribute('data-demo', 'full');
  await expect(page.locator('#menu')).toHaveCSS('background-image', /radial-gradient/);
  await expect(page.getByRole('button', { name: 'Deploy', exact: true })).toBeFocused();
  // The canvas changes from frame to frame: units move and the camera pans.
  const canvas = page.locator('#game canvas');
  const before = await canvas.screenshot();
  await expect.poll(async () => (await canvas.screenshot()).equals(before), { timeout: 5000 }).toBe(false);
});

test('the menu works over the demo: Settings, Credits, the Level select, and a map starts a game that ends it', async ({
  page,
}) => {
  await openMenu(page, { demo: true });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Credits' }).click();
  await expect(page.getByRole('heading', { name: 'Credits' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(root(page)).toHaveAttribute('data-demo', 'full');

  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-demo', 'full');

  await page.getByRole('button', { name: `${FIRST_MAP.name}, no stars yet` }).click();
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(root(page)).not.toHaveAttribute('data-demo');
  await expect(page.locator('#hud')).toBeVisible();
  expect((await state(page)).phase).toBe('build');
});

test('with reduced motion the demo is a still frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page, { demo: true });
  await expect(root(page)).toHaveAttribute('data-demo', 'still');
  const canvas = page.locator('#game canvas');
  await page.waitForTimeout(500); // let the first frames draw
  const before = await canvas.screenshot();
  await page.waitForTimeout(1000);
  expect((await canvas.screenshot()).equals(before)).toBe(true);
});

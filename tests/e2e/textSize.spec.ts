import { expect, test, type Page } from '@playwright/test';
import { openGame, openMenu } from './helpers';

// From #354: the Text size and Reduce motion settings apply to the whole page at once, persist, and at 150 % the phone
// layout still fits with no horizontal scroll.

const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const textScale = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--text-scale'));

async function setTextSizeFromMenu(page: Page, size: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await settingsDialog(page).getByRole('radio', { name: size }).check();
  await page.getByRole('button', { name: 'Back' }).click();
}

/** How far each element sticks out past the window's right edge, or its own box scrolls sideways, in pixels. */
async function overflows(page: Page, selectors: readonly string[]): Promise<Record<string, number>> {
  return page.evaluate((list) => {
    const width = document.documentElement.clientWidth;
    const result: Record<string, number> = { page: document.documentElement.scrollWidth - width };
    for (const selector of list) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element || element.hidden || element.getClientRects().length === 0) continue;
      const right = Math.max(
        ...[...element.querySelectorAll('*'), element].map((e) => e.getBoundingClientRect().right),
      );
      result[selector] = Math.max(Math.ceil(right) - width, element.scrollWidth - element.clientWidth);
    }
    return result;
  }, selectors);
}
const fits = async (page: Page, selectors: readonly string[]) => {
  const found = await overflows(page, selectors);
  const visible = Object.keys(found);
  expect(Object.fromEntries(visible.map((key) => [key, Math.max(0, found[key]!)]))).toEqual(
    Object.fromEntries(visible.map((key) => [key, 0])),
  );
  return visible;
};

test('picking a text size scales the page at once and is kept after a reload', async ({ page }) => {
  await openMenu(page);
  expect(await textScale(page)).toBe('1');
  await page.getByRole('button', { name: 'Settings' }).click();
  await settingsDialog(page).getByRole('radio', { name: '150 %' }).check();
  expect(await textScale(page)).toBe('1.5');
  const titleSize = await page.locator('#settings h2').evaluate((h) => getComputedStyle(h).fontSize);
  expect(titleSize).toBe('33px');

  await openGame(page, { persist: true });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await settingsDialog(page).getByRole('radio', { name: '125 %' }).check();
  await page.reload();
  await page.waitForFunction(() => window.__TD__ !== undefined);
  expect(await textScale(page)).toBe('1.25');
});

test('Reduce motion marks the page at once, from the Settings screen', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const box = settingsDialog(page).getByRole('checkbox', { name: 'Reduce motion' });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', '');
  await box.uncheck();
  await expect(page.locator('html')).not.toHaveAttribute('data-reduced-motion');
});

test.describe('the system asks for less motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Reduce motion starts on', async ({ page }) => {
    await openMenu(page);
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', '');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(settingsDialog(page).getByRole('checkbox', { name: 'Reduce motion' })).toBeChecked();
  });
});

for (const [name, viewport] of [
  ['a 400 px phone', { width: 400, height: 800 }],
  ['the 900 px desktop', { width: 900, height: 560 }],
] as const)
  test.describe(`on ${name} at 150 %`, () => {
    test.use({ viewport });

    test('the menus, the HUD, the build bar, the pause menu and the Settings screen fit with no horizontal scroll', async ({
      page,
    }) => {
      await openMenu(page);
      await setTextSizeFromMenu(page, '150 %');
      expect(await fits(page, ['#menu'])).toContain('#menu');
      await page.getByRole('button', { name: 'Settings' }).click();
      await settingsDialog(page).waitFor();
      expect(await fits(page, ['#settings'])).toContain('#settings');
      // Taller than the window at 150 %: the dialog scrolls, so Back can still be reached.
      const backButton = page.getByRole('button', { name: 'Back' });
      await backButton.scrollIntoViewIfNeeded();
      await expect(backButton).toBeInViewport();
      await page.getByRole('button', { name: 'Back' }).click();
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.getByRole('heading', { name: 'Select map' }).waitFor();
      expect(await fits(page, ['#level-select'])).toContain('#level-select');

      await page
        .getByRole('button', { name: /no stars yet/ })
        .first()
        .click();
      await page.waitForFunction(() => window.__TD__ !== undefined);
      expect(await fits(page, ['#hud', '#build-bar'])).toEqual(expect.arrayContaining(['#hud', '#build-bar']));
      await page.getByRole('button', { name: 'Pause' }).click();
      await page.getByRole('dialog', { name: 'Paused' }).waitFor();
      expect(await fits(page, ['#pause-menu'])).toContain('#pause-menu');
    });
  });

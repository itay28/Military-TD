import { expect, test } from '@playwright/test';
import { FOURTH_MAP } from './firstMap';
import { openLevelSelect, openMenu } from './helpers';

// From #370: on a phone the Level select was clipped top and bottom and could not scroll.

for (const [name, viewport] of [
  ['portrait', { width: 375, height: 667 }],
  ['landscape', { width: 667, height: 375 }],
] as const) {
  test.describe(`on a phone (${name} ${viewport.width} × ${viewport.height})`, () => {
    test.use({ viewport });

    test('the first map, the last map and Back can each be scrolled to', async ({ page }) => {
      await openLevelSelect(page, { unlockAll: true });
      const last = page.getByRole('button', { name: `${FOURTH_MAP.name}, no stars yet` });
      const back = page.getByRole('button', { name: 'Back', exact: true });
      // Opening focuses the first map, which scrolls it into view, so the title is checked by scrolling back up.
      await page.getByRole('heading', { name: 'Operations' }).scrollIntoViewIfNeeded();
      await expect(page.getByRole('heading', { name: 'Operations' })).toBeInViewport();
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      await back.scrollIntoViewIfNeeded();
      await expect(back).toBeInViewport();
      await back.click();
      await expect(page.getByRole('heading', { name: 'Operations' })).toBeHidden();
    });
  });
}

test('on a desktop screen the Level select stays centred', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLevelSelect(page, { unlockAll: true });
  const gaps = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#level-select')!;
    const top = document.querySelector('#level-select h1')!.getBoundingClientRect().top;
    const back = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Back')!;
    return { top, bottom: innerHeight - back.getBoundingClientRect().bottom };
  });
  expect(Math.abs(gaps.top - gaps.bottom)).toBeLessThan(2);
  expect(gaps.top).toBeGreaterThan(0);
});

// The Main menu shares the rule, so a short phone screen must reach its title and last button too.
test('on a short phone screen the Main menu title and last button can be scrolled to', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 120 });
  await openMenu(page);
  const buttons = page.locator('#menu > button');
  await page.getByRole('heading', { name: 'Military TD' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Military TD' })).toBeInViewport();
  await buttons.last().scrollIntoViewIfNeeded();
  await expect(buttons.last()).toBeInViewport();
  const scrolls = await page.evaluate(() => {
    const m = document.querySelector<HTMLElement>('#menu')!;
    return m.scrollHeight > m.clientHeight;
  });
  expect(scrolls).toBe(true);
});

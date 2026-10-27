import { expect, test } from '@playwright/test';
import { openGame, playToEnd } from './helpers';

/** Ends the game with many towers placed so the damage report is as tall as it gets. */
async function openEndScreen(page: Parameters<typeof openGame>[0]) {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('every-tower-kind'));
  await playToEnd(page);
  await expect(page.getByTestId('restart')).toBeVisible();
}

const scrollState = (page: Parameters<typeof openGame>[0]) =>
  page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('#end-screen [role="dialog"]')!;
    return {
      scrollTop: dialog.scrollTop,
      overflows: dialog.scrollHeight > dialog.clientHeight,
      cue: getComputedStyle(dialog).backgroundImage !== 'none',
    };
  });

test.describe('on a short screen (900 × 420)', () => {
  test.use({ viewport: { width: 900, height: 420 } });

  test('the End screen opens at the top with Restart focused, and shows it can scroll', async ({ page }) => {
    await openEndScreen(page);
    const { scrollTop, overflows, cue } = await scrollState(page);
    expect(overflows).toBe(true);
    expect(scrollTop).toBe(0);
    expect(cue).toBe(true);
    await expect(page.getByRole('heading', { name: /Victory|Defeat/ })).toBeInViewport();
    await expect(page.getByTestId('restart')).toBeFocused();
  });
});

test.describe('on the default screen (900 × 560)', () => {
  test('the report fits, so there is nothing to scroll', async ({ page }) => {
    await openEndScreen(page);
    const { scrollTop, overflows } = await scrollState(page);
    expect(overflows).toBe(false);
    expect(scrollTop).toBe(0);
    await expect(page.getByTestId('restart')).toBeFocused();
  });
});

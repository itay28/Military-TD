import { expect, test, type Page } from '@playwright/test';
import { openGame, playToEnd } from './helpers';

/** Ends the game with many towers placed so the damage report is as tall as it gets. */
async function openEndScreen(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('every-tower-kind'));
  await playToEnd(page);
  await expect(page.getByTestId('restart')).toBeVisible();
}

const scrollState = (page: Page) =>
  page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('#end-screen [role="dialog"]')!;
    return {
      scrollTop: dialog.scrollTop,
      overflows: dialog.scrollHeight > dialog.clientHeight,
      // The cue is the glow layers (`scroll`) under cover layers (`local`) that hide it where nothing is clipped.
      cue: getComputedStyle(dialog).backgroundAttachment === 'local, local, scroll, scroll, scroll',
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

// Font metrics differ between machines (CI's container overflows at 560), so "fits" is checked with room to spare.
test.describe('on a tall screen (900 × 800)', () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test('the report fits, so there is nothing to scroll', async ({ page }) => {
    await openEndScreen(page);
    const { scrollTop, overflows, cue } = await scrollState(page);
    expect(overflows).toBe(false);
    expect(cue).toBe(true); // same layers; with no overflow the `local` covers hide the glow
    expect(scrollTop).toBe(0);
    await expect(page.getByTestId('restart')).toBeFocused();
  });
});

import { expect, test, type Page } from '@playwright/test';
import { clickTile, openGame, selectKind, state } from './helpers';

// From #68: the first-map hints, each waiting on its action, with Skip hints. Test mode starts with them off;
// __TD__.setHints(true) turns them on as for a new player.

const BESIDE_PATH = { col: 1, row: 3 };
const HINT = {
  place: 'Pick a tower, then tap a tile beside the road',
  startWave: 'Press Start Wave when you are ready',
  selectTower: 'Select a tower to upgrade or sell it',
};

const hint = (page: Page) => page.locator('#hints [role="status"]');
const skip = (page: Page) => page.getByRole('button', { name: 'Skip hints' });

async function openWithHints(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.setHints(true));
}

/**
 * Runs ticks, a second at a time, until the first wave is cleared, as the real-time loop would. Wave 2 may be due by
 * then (#570). The loop runs in the page: one browser round-trip per step made this test take 25 s of its 30 (#579).
 */
async function clearFirstWave(page: Page) {
  const cleared = await page.evaluate(() => {
    const td = window.__TD__!;
    for (let ticks = 0; ticks < 20_000; ticks += 60) {
      if (td.step(60).wavesCleared >= 1) return true;
    }
    return false;
  });
  expect(cleared, 'the first wave clears within 20 000 ticks').toBe(true);
  expect((await state(page)).wavesCleared).toBe(1);
}

/** The callout's box lies inside the viewport. */
async function expectOnScreen(page: Page) {
  const box = await hint(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

test('test mode shows no hints unless a spec turns them on', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#hints')).toBeHidden();
  await expect(skip(page)).toHaveCount(0);
});

test('a tower still selected when the first wave clears does not skip the select-a-tower hint', async ({ page }) => {
  await openWithHints(page);
  await selectKind(page);
  await clickTile(page, BESIDE_PATH);
  await page.getByTestId('start-wave').click();
  await clickTile(page, BESIDE_PATH); // select the tower while wave 1 runs
  await expect(page.getByRole('dialog', { name: 'Rifle Nest' })).toBeVisible();
  await clearFirstWave(page);
  await expect(hint(page)).toHaveText(new RegExp(HINT.selectTower));
});

test('the three hints follow the player: place a tower, start the wave, then select a tower', async ({ page }) => {
  await openWithHints(page);
  await expect(hint(page)).toHaveText(new RegExp(HINT.place));
  await expectOnScreen(page);

  // The hint doesn't block the map: placing goes through as usual.
  await selectKind(page);
  await expect(hint(page)).toHaveText(new RegExp(HINT.place)); // picking a kind is not placing yet
  await clickTile(page, BESIDE_PATH);
  await expect(hint(page)).toHaveText(new RegExp(HINT.startWave));
  await expectOnScreen(page);

  await page.getByTestId('start-wave').click();
  await expect(page.locator('#hints')).toBeHidden(); // nothing while the first wave runs
  await clearFirstWave(page);
  await expect(hint(page)).toHaveText(new RegExp(HINT.selectTower));
  await expectOnScreen(page);

  await page.keyboard.press('Escape'); // cancels the build selection; doesn't skip
  await expect(hint(page)).toBeVisible();
  await clickTile(page, BESIDE_PATH);
  await expect(page.getByRole('dialog', { name: 'Rifle Nest' })).toBeVisible();
  await expect(page.locator('#hints')).toBeHidden();
});

test('Skip hints ends all three', async ({ page }) => {
  await openWithHints(page);
  await skip(page).click();
  await expect(page.locator('#hints')).toBeHidden();
  await selectKind(page);
  await clickTile(page, BESIDE_PATH);
  await page.getByTestId('start-wave').click();
  await clearFirstWave(page);
  await expect(page.locator('#hints')).toBeHidden();
});

test('the pause menu hides the hint, and resuming brings it back', async ({ page }) => {
  await openWithHints(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#hints')).toBeHidden();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(hint(page)).toHaveText(new RegExp(HINT.place));
});

test.describe('on a 400 px wide phone', () => {
  test.use({ viewport: { width: 400, height: 760 }, hasTouch: true });

  test('each hint stays on screen', async ({ page }) => {
    await openWithHints(page);
    await expect(hint(page)).toHaveText(new RegExp(HINT.place));
    await expectOnScreen(page);
    await page.evaluate(() =>
      window.__TD__!.command({ type: 'placeTower', kind: 'rifleNest', tile: { col: 1, row: 3 } }),
    );
    await expect(hint(page)).toHaveText(new RegExp(HINT.startWave));
    await expectOnScreen(page);
    await page.evaluate(() => window.__TD__!.command({ type: 'callNextWave' }));
    await clearFirstWave(page);
    await expect(hint(page)).toHaveText(new RegExp(HINT.selectTower));
    await expectOnScreen(page);
  });
});

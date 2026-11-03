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

/** Runs ticks until the first wave is over, as the real-time loop would. */
async function clearFirstWave(page: Page) {
  await expect
    .poll(async () => (await page.evaluate(() => window.__TD__!.step(600))).phase, { timeout: 30_000 })
    .not.toBe('wave');
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
    await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
    await clearFirstWave(page);
    await expect(hint(page)).toHaveText(new RegExp(HINT.selectTower));
    await expectOnScreen(page);
  });
});

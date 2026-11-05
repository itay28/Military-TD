import { expect, test, type Page } from '@playwright/test';
import { ENEMY_NAMES, ENEMY_WEAKNESS, TOWER_ROLES } from '../../src/data/display';
import { ENEMY_STATS } from '../../src/data/enemies';
import { clickTile, enemyToScreen, openGame, state, view } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };

/** Starts wave 1 and steps 3 s in, so Infantry walk the Path; returns the first one's id. */
async function midWave(page: Page): Promise<number> {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await page.evaluate(() => window.__TD__!.step(180));
  const infantry = (await state(page)).enemies.find((e) => e.kind === 'infantry');
  if (!infantry) throw new Error('No Infantry on the map 3 s into wave 1');
  return infantry.id;
}

const card = (page: Page) => page.locator('#enemy-card').getByRole('dialog', { name: ENEMY_NAMES.infantry });

test('tapping an Infantry opens its card, naming it, with its stats and what hurts it', async ({ page }) => {
  const id = await midWave(page);
  const { x, y } = await enemyToScreen(page, id);
  await page.mouse.click(x, y);
  await expect(card(page)).toBeVisible();
  await expect(page.getByTestId('enemy-hp')).toHaveText(
    `${ENEMY_STATS.infantry.maxHp} / ${ENEMY_STATS.infantry.maxHp}`,
  );
  await expect(page.getByTestId('enemy-layer')).toHaveText('Ground');
  await expect(page.getByTestId('enemy-weakness')).toHaveText(ENEMY_WEAKNESS.infantry);
  await expect
    .poll(async () => (await view(page)).enemyCard)
    .toEqual({ enemyId: id, kind: 'infantry', name: ENEMY_NAMES.infantry, pinned: true });
});

test('Escape closes the card without pausing', async ({ page }) => {
  const id = await midWave(page);
  const { x, y } = await enemyToScreen(page, id);
  await page.mouse.click(x, y);
  await expect(card(page)).toBeVisible();
  await page.mouse.move(0, 0); // a mouse still over the enemy would show its card on hover
  await page.keyboard.press('Escape');
  await expect(card(page)).toBeHidden();
  await expect(page.locator('#pause-menu')).toBeHidden();
});

test('hovering an enemy with the mouse shows its card; moving off closes it', async ({ page }) => {
  const id = await midWave(page);
  const { x, y } = await enemyToScreen(page, id);
  await page.mouse.move(x, y);
  await expect.poll(async () => (await view(page)).enemyCard).toMatchObject({ enemyId: id, pinned: false });
  await page.mouse.move(x, y + 200);
  await expect.poll(async () => (await view(page)).enemyCard).toBeNull();
});

test('the card closes when its enemy leaves the map', async ({ page }) => {
  const id = await midWave(page);
  const { x, y } = await enemyToScreen(page, id);
  await page.mouse.click(x, y);
  await expect(card(page)).toBeVisible();
  await page.mouse.move(0, 0); // so the mouse hovers no other enemy
  await page.evaluate(() => window.__TD__!.step(60 * 60));
  expect((await state(page)).enemies.some((e) => e.id === id)).toBe(false);
  await expect.poll(async () => (await view(page)).enemyCard).toBeNull();
});

test("then tapping a tower closes the card and the panel shows the tower's role", async ({ page }) => {
  const id = await midWave(page);
  await page.evaluate((tile) => window.__TD__!.command({ type: 'placeTower', kind: 'rifleNest', tile }), BESIDE_PATH);
  const { x, y } = await enemyToScreen(page, id);
  await page.mouse.click(x, y);
  await expect(card(page)).toBeVisible();
  await clickTile(page, BESIDE_PATH);
  await expect(page.getByTestId('tower-role')).toHaveText(TOWER_ROLES.rifleNest);
  await expect(card(page)).toBeHidden();
});

test.describe('on a 390 × 844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap 14 px off a small Infantry still opens its card', async ({ page }) => {
    const id = await midWave(page);
    const { x, y } = await enemyToScreen(page, id);
    // Zoomed out to fit, the Infantry is drawn well under 32 px across; its hit area is still about 32 px.
    expect((await view(page)).camera.zoom).toBeLessThan(1);
    await page.touchscreen.tap(x + 14, y);
    await expect
      .poll(async () => (await view(page)).enemyCard)
      .toMatchObject({ enemyId: id, kind: 'infantry', pinned: true });
  });
});

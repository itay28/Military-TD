import { expect, test, type Page } from '@playwright/test';
import { enemyToScreen, openGame, state, tileToScreen } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };
/** The smallest tap target on a phone, in CSS px (issue #72). */
const MIN_TAP = 32;

for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test.describe(`touch audit on a ${viewport.width} × ${viewport.height} phone`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    const tooSmall = async (page: Page, selector: string) =>
      page.locator(selector).evaluateAll((els, min) => {
        return els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const { width, height } = el.getBoundingClientRect();
            return {
              name: el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.textContent,
              width,
              height,
            };
          })
          .filter((b) => b.width < min || b.height < min);
      }, MIN_TAP);

    test('the HUD and build bar buttons are at least 32 px both ways', async ({ page }) => {
      await openGame(page);
      expect(await tooSmall(page, '#hud button')).toEqual([]);
      expect(await tooSmall(page, '#build-bar button')).toEqual([]);
    });

    test('the tower panel buttons are at least 32 px both ways', async ({ page }) => {
      await openGame(page);
      await page.getByTestId('build-rifleNest').tap();
      const { x, y } = await tileToScreen(page, BESIDE_PATH);
      await page.touchscreen.tap(x, y);
      await page.getByTestId('build-rifleNest').tap(); // deselect, so the next tap selects the tower
      await page.touchscreen.tap(x, y);
      await expect(page.getByTestId('tower-upgrade')).toBeVisible();
      expect(await tooSmall(page, '#tower-panel button')).toEqual([]);
    });

    test('place, upgrade, sell, start a wave and open the enemy card, all by tap', async ({ page }) => {
      await openGame(page);
      const tap = async (tile: { col: number; row: number }) => {
        const { x, y } = await tileToScreen(page, tile);
        await page.touchscreen.tap(x, y);
      };
      await page.getByTestId('build-rifleNest').tap();
      await tap(BESIDE_PATH);
      expect((await state(page)).towers.map((t) => t.tile)).toEqual([BESIDE_PATH]);
      await page.getByTestId('build-rifleNest').tap(); // deselect

      await tap(BESIDE_PATH);
      await page.getByTestId('tower-upgrade').tap();
      await expect.poll(async () => (await state(page)).towers[0]?.level).toBe(2);

      await page.getByTestId('tower-sell').tap();
      await page.evaluate(() => window.__TD__!.step(300)); // dismantling takes a few seconds
      await expect.poll(async () => (await state(page)).towers).toEqual([]);

      await page.getByTestId('start-wave').tap();
      await page.evaluate(() => window.__TD__!.step(180));
      const infantry = (await state(page)).enemies.find((e) => e.kind === 'infantry')!;
      const { x, y } = await enemyToScreen(page, infantry.id);
      await page.touchscreen.tap(x, y);
      await expect(page.locator('#enemy-card').getByRole('dialog')).toBeVisible();
    });

    test('a refused upgrade says why on the screen, not only in a tooltip', async ({ page }) => {
      await openGame(page);
      await page.getByTestId('build-rifleNest').tap();
      const { x, y } = await tileToScreen(page, BESIDE_PATH);
      await page.touchscreen.tap(x, y);
      await page.getByTestId('build-rifleNest').tap();
      await page.touchscreen.tap(x, y);
      // Spend the rest of the money, so the upgrade cannot be afforded.
      await page.evaluate(() =>
        window.__TD__!.command({ type: 'placeTower', kind: 'rifleNest', tile: { col: 1, row: 1 } }),
      );
      await expect(page.getByTestId('tower-upgrade')).toBeDisabled();
      await expect(page.getByTestId('tower-upgrade-reason')).toBeVisible();
    });
  });
}

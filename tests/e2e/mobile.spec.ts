import { expect, test, type Page } from '@playwright/test';
import { TOWER_STATS } from '../../src/data/towers';
import { clickTile, openGame, selectKind, state, tileToScreen, view } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };

/** Sends raw touch events, one finger per point, as a phone would. */
async function touchscreen(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

// A phone in landscape and in portrait, with touch, as the itch.io page opens on one.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test.describe(`on a ${viewport.width} × ${viewport.height} phone`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the HUD, the map and the build bar all fit on the screen, with no page scroll', async ({ page }) => {
      await openGame(page);
      for (const selector of ['#hud', '#game canvas', '#build-bar']) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.x, selector).toBeGreaterThanOrEqual(0);
        expect(box.y, selector).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height + 0.5);
      }
      const bar = (await page.locator('#build-bar').boundingBox())!;
      expect(bar.x + bar.width).toBeGreaterThan(viewport.width - 12);
      const scroll = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(scroll).toEqual({ x: 0, y: 0 });
    });

    test('the map starts zoomed out to fit, and a tap on a tile places the selected kind', async ({ page }) => {
      await openGame(page);
      const { camera } = await view(page);
      expect(camera.zoom).toBeLessThan(1);
      await selectKind(page);
      const { x, y } = await tileToScreen(page, BESIDE_PATH);
      await page.touchscreen.tap(x, y);
      expect((await state(page)).towers.map((t) => t.tile)).toEqual([BESIDE_PATH]);
    });

    test('with a kind selected, a drag moves the Ghost and lifting places the tower there, once', async ({ page }) => {
      await openGame(page);
      await selectKind(page);
      const { money } = await state(page);
      const from = await tileToScreen(page, { col: 1, row: 1 });
      const to = await tileToScreen(page, BESIDE_PATH);
      const touch = await touchscreen(page);
      await touch('touchStart', [from]);
      for (let i = 1; i <= 5; i++) {
        await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 5, y: from.y + ((to.y - from.y) * i) / 5 }]);
      }
      // The Ghost follows the finger, and nothing is placed until it lifts.
      await expect.poll(async () => (await view(page)).ghost).toEqual({ visible: true, tile: BESIDE_PATH });
      expect((await state(page)).towers).toEqual([]);
      await touch('touchEnd', []);

      const after = await state(page);
      expect(after.towers.map((t) => t.tile)).toEqual([BESIDE_PATH]);
      expect(after.money).toBe(money - TOWER_STATS.rifleNest.cost);
      // A lifted finger hovers nothing, so it leaves no Ghost behind; the kind stays selected for the next one.
      await expect.poll(async () => (await view(page)).ghost.visible).toBe(false);
      await expect(page.getByTestId('build-rifleNest')).toHaveAttribute('aria-pressed', 'true');
    });

    test('a drag lifted over the build bar places nothing', async ({ page }) => {
      await openGame(page);
      await selectKind(page);
      const { money } = await state(page);
      const from = await tileToScreen(page, BESIDE_PATH);
      const bar = (await page.locator('#build-bar').boundingBox())!;
      const to = { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 };
      const touch = await touchscreen(page);
      await touch('touchStart', [from]);
      for (let i = 1; i <= 5; i++) {
        await touch('touchMove', [{ x: from.x + ((to.x - from.x) * i) / 5, y: from.y + ((to.y - from.y) * i) / 5 }]);
      }
      await touch('touchEnd', []);
      await page.evaluate(() => window.__TD__!.step(1));
      expect((await state(page)).towers).toEqual([]);
      expect((await state(page)).money).toBe(money);
    });

    test('with nothing selected, a drag pans the map and places nothing', async ({ page }) => {
      await openGame(page);
      const touch = await touchscreen(page);
      // Pinch out with two fingers first, so there is room to pan.
      const c = await tileToScreen(page, { col: 8, row: 5 });
      await touch('touchStart', [
        { x: c.x - 20, y: c.y },
        { x: c.x + 20, y: c.y },
      ]);
      for (let i = 1; i <= 5; i++) {
        await touch('touchMove', [
          { x: c.x - 20 - i * 15, y: c.y },
          { x: c.x + 20 + i * 15, y: c.y },
        ]);
      }
      await touch('touchEnd', []);
      await expect.poll(async () => (await view(page)).camera.zoom).toBeGreaterThan(1);
      const before = (await view(page)).camera;

      await touch('touchStart', [c]);
      for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: c.x - i * 12, y: c.y - i * 6 }]);
      await touch('touchEnd', []);

      const after = (await view(page)).camera;
      expect(after.scrollX).toBeGreaterThan(before.scrollX);
      expect(after.scrollY).toBeGreaterThan(before.scrollY);
      expect((await state(page)).towers).toEqual([]);
    });
  });
}

test('dragging the map pans it and places nothing', async ({ page }) => {
  await openGame(page);
  await selectKind(page);
  // Zoom in first, so there is room to pan.
  const { x, y } = await tileToScreen(page, { col: 8, row: 5 });
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -500);
  await expect.poll(async () => (await view(page)).camera.zoom).toBeGreaterThan(1.5);
  const before = (await view(page)).camera;

  await page.mouse.down();
  await page.mouse.move(x - 60, y - 30, { steps: 5 });
  await page.mouse.up();

  const after = (await view(page)).camera;
  expect(after.scrollX).toBeGreaterThan(before.scrollX);
  expect(after.scrollY).toBeGreaterThan(before.scrollY);
  expect((await state(page)).towers).toEqual([]);
});

test('the wheel zooms in around the pointer and back out to fit, but no further', async ({ page }) => {
  await openGame(page);
  const fit = (await view(page)).camera.zoom;
  const { x, y } = await tileToScreen(page, BESIDE_PATH);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await view(page)).camera.zoom).toBeGreaterThan(fit);
  // The tile stays under the pointer.
  const still = await tileToScreen(page, BESIDE_PATH);
  // Within a pixel or two: the mouse sits on whole pixels.
  expect(Math.abs(still.x - x)).toBeLessThan(2);
  expect(Math.abs(still.y - y)).toBeLessThan(2);

  await page.mouse.wheel(0, 3000);
  await expect.poll(async () => (await view(page)).camera.zoom).toBeCloseTo(fit);
});

test('after zooming and panning, a click still lands on the tile under the pointer', async ({ page }) => {
  await openGame(page);
  await selectKind(page);
  const centre = await tileToScreen(page, { col: 8, row: 5 });
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await view(page)).camera.zoom).toBeGreaterThan(1.3);
  await clickTile(page, { col: 6, row: 3 });
  expect((await state(page)).towers.map((t) => t.tile)).toEqual([{ col: 6, row: 3 }]);
});

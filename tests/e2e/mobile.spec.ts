import { expect, test } from '@playwright/test';
import { clickTile, openGame, selectKind, state, tileToScreen, view } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };

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

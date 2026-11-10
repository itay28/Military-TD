import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { openGame, state, stepToEnd, view } from './helpers';

const LAYERS = ['map', 'towers', 'enemies'];

/** The share of the canvas that is near black: an empty map is all dark fill and faint grid; the tileset is not. */
async function darkShare(page: Page): Promise<number> {
  const { data } = PNG.sync.read(await page.locator('#game canvas').screenshot());
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) < 48) dark++;
  return dark / (data.length / 4);
}

/** Loads a one-tower game and steps into its wave until the enemy is drawn. */
async function callNextWave(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'callNextWave' }));
  await page.evaluate(() => window.__TD__!.step(10));
  // Enemy views are made on the next frame, so wait for one.
  await expect.poll(async () => (await view(page)).drawOrder).toContain('enemies');
}

test('the atlas loads: sprites on, same draw order, the game plays to Victory', async ({ page }) => {
  await openGame(page);
  await callNextWave(page);
  const { sprites, mapTiles, drawOrder } = await view(page);
  expect(sprites).toBe(true);
  expect(mapTiles).toBe('image');
  expect(drawOrder.filter((layer) => LAYERS.includes(layer))).toEqual(LAYERS);
  expect((await stepToEnd(page)).phase).toBe('victory');
});

test('a blocked ground image falls back to the tileset (#312)', async ({ page }) => {
  const blocked: string[] = [];
  await page.route(/\/training-ground[^/]*\.jpg$/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  await openGame(page);
  expect(blocked.length).toBeGreaterThan(0);
  await callNextWave(page);
  const { sprites, mapTiles } = await view(page);
  expect(sprites).toBe(true);
  expect(mapTiles).toBe('sprites');
  expect(await darkShare(page)).toBeLessThan(0.5);
  expect((await stepToEnd(page)).phase).toBe('victory');
});

test('a blocked atlas and ground image fall back to shapes and never break the game', async ({ page }) => {
  const blocked: string[] = [];
  await page.route(/\/(sprites[^/]*\.(png|json)|training-ground[^/]*\.jpg)$/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  await openGame(page);
  expect(blocked.length).toBeGreaterThan(0);
  await callNextWave(page);
  const { sprites, mapTiles, drawOrder } = await view(page);
  expect(sprites).toBe(false);
  expect(mapTiles).toBe('shapes');
  expect(drawOrder.filter((layer) => LAYERS.includes(layer))).toEqual(LAYERS);
  expect((await stepToEnd(page)).phase).toBe('victory');
});

test("a tower's turret turns to face its target", async ({ page }) => {
  await openGame(page);
  await callNextWave(page);
  // Step until the Infantry is in the Rifle Nest's range; the game then waits (?step=manual) while the turret turns.
  let gap = Infinity;
  let aim = 0;
  for (let i = 0; i < 600 && gap > 0; i += 5) {
    const { towers, enemies } = await state(page);
    const tower = towers[0]!;
    const enemy = enemies[0];
    if (enemy) {
      const center = { x: tower.tile.col + 0.5, y: tower.tile.row + 0.5 };
      const dx = enemy.position.x - center.x;
      const dy = enemy.position.y - center.y;
      gap = Math.hypot(dx, dy) - tower.range;
      aim = Math.atan2(dy, dx);
    }
    if (gap > 0) await page.evaluate(() => window.__TD__!.step(5));
  }
  expect(gap).toBeLessThanOrEqual(0);
  // Not where a placed turret starts (north), so it must have turned.
  expect(Math.abs(aim + Math.PI / 2)).toBeGreaterThan(0.1);
  const towerId = (await state(page)).towers[0]!.id;
  await expect
    .poll(async () => (await view(page)).turrets.find((turret) => turret.towerId === towerId)?.angle)
    .toBeCloseTo(aim, 2);
});

/** Every tower kind beside the Path and a Tank and an Infantry walking it, all drawn. */
async function towersAndTank(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.__TD__!.loadScenario('every-tower-kind'));
  await page.evaluate(() => window.__TD__!.command({ type: 'spawnEnemy', kind: 'tank' }));
  await page.evaluate(() => window.__TD__!.command({ type: 'spawnEnemy', kind: 'infantry' }));
  await page.evaluate(() => window.__TD__!.step(30));
  await expect.poll(async () => (await view(page)).enemies.length).toBe(2);
}

test('the AA Gun and the Tank are drawn from their renders; every other kind keeps Kenney', async ({ page }) => {
  await openGame(page);
  await towersAndTank(page);
  const { rendered, sprites, drawOrder } = await view(page);
  expect(sprites).toBe(true);
  expect(rendered).toEqual(['aaGun', 'tank']);
  expect(drawOrder.filter((layer) => LAYERS.includes(layer))).toEqual(LAYERS);
});

test('a render that fails to load falls back to the Kenney sprite', async ({ page }) => {
  await page.route(/-(hull|turret)[^/]*\.png$/, (route) => route.abort());
  await openGame(page);
  await towersAndTank(page);
  const { rendered, sprites } = await view(page);
  expect(sprites).toBe(true);
  expect(rendered).toEqual([]);
});

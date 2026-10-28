import { expect, test } from '@playwright/test';
import { openGame, state, stepToEnd, view } from './helpers';

const LAYERS = ['map', 'towers', 'enemies'];

/** Loads a one-tower game and steps into its wave until the enemy is drawn. */
async function startWave(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await page.evaluate(() => window.__TD__!.step(10));
  // Enemy views are made on the next frame, so wait for one.
  await expect.poll(async () => (await view(page)).drawOrder).toContain('enemies');
}

test('the atlas loads: sprites on, same draw order, the game plays to Victory', async ({ page }) => {
  await openGame(page);
  await startWave(page);
  const { sprites, drawOrder } = await view(page);
  expect(sprites).toBe(true);
  expect(drawOrder.filter((layer) => LAYERS.includes(layer))).toEqual(LAYERS);
  expect((await stepToEnd(page)).phase).toBe('victory');
});

test('a blocked atlas falls back to shapes and never breaks the game', async ({ page }) => {
  const blocked: string[] = [];
  await page.route(/\/sprites[^/]*\.(png|json)$/, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  await openGame(page);
  expect(blocked.length).toBeGreaterThan(0);
  await startWave(page);
  const { sprites, drawOrder } = await view(page);
  expect(sprites).toBe(false);
  expect(drawOrder.filter((layer) => LAYERS.includes(layer))).toEqual(LAYERS);
  expect((await stepToEnd(page)).phase).toBe('victory');
});

test("a tower's turret turns to face its target", async ({ page }) => {
  await openGame(page);
  await startWave(page);
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

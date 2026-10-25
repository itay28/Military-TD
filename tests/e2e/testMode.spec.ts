import { expect, test } from '@playwright/test';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { openGame, state, stepToEnd } from './helpers';

test('step=manual: the game stands still in real time, and step() advances it', async ({ page }) => {
  await openGame(page, { manualStep: true });
  await page.getByRole('button', { name: 'Start Wave' }).click();
  await page.waitForTimeout(500);
  expect((await state(page)).timeMs).toBe(0);
  const after = await page.evaluate(() => window.__TD__!.step(60));
  expect(after.timeMs).toBeCloseTo(1000);
});

test('speed=8: game time runs faster than real time', async ({ page }) => {
  await openGame(page, { manualStep: false, speed: 8 });
  const start = await page.evaluate(() => ({ real: performance.now(), game: window.__TD__!.state().timeMs }));
  await page.waitForTimeout(1000);
  const end = await page.evaluate(() => ({ real: performance.now(), game: window.__TD__!.state().timeMs }));
  // 8× in theory; a slow CI machine drops frames, so only ask for clearly faster than real time.
  expect((end.game - start.game) / (end.real - start.real)).toBeGreaterThan(2);
});

test("loadScenario sets up a named scenario's game, and the test plays it from there", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  expect(await state(page)).toMatchObject({
    towers: [{ tile: { col: 1, row: 3 } }],
    money: START_MONEY,
    totalWaves: 1,
    timeMs: 0,
  });
  await expect(page.getByTestId('hud-wave')).toHaveText('Wave 0 / 1');

  expect(await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }))).toEqual({ ok: true });
  expect(await stepToEnd(page)).toMatchObject({ phase: 'victory', lives: START_LIVES });
});

test('loadScenario rejects an unknown name', async ({ page }) => {
  await openGame(page);
  await expect(page.evaluate(() => window.__TD__!.loadScenario('no-such-scenario'))).rejects.toThrow(
    /no-such-scenario/,
  );
});

test('without test=1 there is no __TD__', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  expect(await page.evaluate(() => window.__TD__)).toBeUndefined();
});

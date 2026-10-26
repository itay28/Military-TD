import { expect, test } from '@playwright/test';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { TOWER_STATS } from '../../src/data/towers';
import { MVP_WAVES } from '../../src/data/waves';
import { clickTile, openGame, state, stepToEnd } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };
const ON_PATH = { col: 0, row: 2 };

test('place a tower by clicking, start the wave and play to Victory or Defeat', async ({ page }) => {
  await openGame(page);

  await clickTile(page, BESIDE_PATH);
  const placed = await state(page);
  expect(placed.towers.map((t) => t.tile)).toEqual([BESIDE_PATH]);
  const money = START_MONEY - TOWER_STATS.rifleNest.cost;
  expect(placed.money).toBe(money);
  await expect(page.getByTestId('hud-money')).toHaveText(`Money ${money}`);

  await page.getByRole('button', { name: 'Start Wave' }).click();
  expect((await state(page)).phase).toBe('wave');
  await expect(page.getByRole('button', { name: 'Start Wave' })).toBeDisabled();

  const end = await stepToEnd(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: end.phase === 'victory' ? 'Victory' : 'Defeat' })).toBeVisible();
});

test('a click on the Path places nothing', async ({ page }) => {
  await openGame(page);
  await clickTile(page, ON_PATH);
  expect(await state(page)).toMatchObject({ towers: [], money: START_MONEY });
});

// From #15 / #129: the End screen must really be visible, and Restart must give a fresh game.
test('Restart after the game ends starts a fresh game', async ({ page }) => {
  await openGame(page);
  await clickTile(page, BESIDE_PATH);
  await page.getByRole('button', { name: 'Start Wave' }).click();
  await stepToEnd(page);
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByRole('button', { name: 'Restart' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('hud-money')).toHaveText(`Money ${START_MONEY}`);
  await expect(page.getByTestId('hud-lives')).toHaveText(`Lives ${START_LIVES}`);
  await expect(page.getByTestId('hud-wave')).toHaveText(`Wave 0 / ${MVP_WAVES.length}`);
  await expect(page.getByRole('button', { name: 'Start Wave' })).toBeEnabled();
  expect(await state(page)).toMatchObject({ phase: 'build', towers: [], enemies: [], timeMs: 0 });
});

// From #53: the DPS readout is dashes before a wave, live during it, and keeps the figure after it.
test('the DPS readout shows the wave figure and keeps it after the wave clears', async ({ page }) => {
  await openGame(page);
  const dps = page.getByTestId('hud-dps');
  await expect(dps).toHaveText('DPS –');

  await clickTile(page, BESIDE_PATH);
  await page.getByRole('button', { name: 'Start Wave' }).click();
  for (let i = 0; i < 100 && (await state(page)).stats.total.kills === 0; i++)
    await page.evaluate(() => window.__TD__!.step(10));
  expect((await state(page)).stats.total.kills).toBeGreaterThan(0);
  await expect(dps).toHaveText(/^DPS [1-9]\d*$/);

  let now = await state(page);
  while (now.phase === 'wave') now = await page.evaluate(() => window.__TD__!.step(60));
  const figure = await dps.textContent();
  expect(figure).toMatch(/^DPS [1-9]\d*$/);
  await page.evaluate(() => window.__TD__!.step(600));
  await expect(dps).toHaveText(figure!);
});

import { expect, test } from '@playwright/test';
import { FIRST_MAP, FOURTH_MAP, SECOND_MAP, THIRD_MAP } from './firstMap';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { SWITCHBACK_WAVES } from '../../src/data/waves';
import { openLevelSelect, state } from './helpers';

// From #51: Main menu → Play → Level select → Game on the chosen map; Back returns to the Main menu.

const first = FIRST_MAP;

test('the Level select shows each map as a button with a preview, the first focused', async ({ page }) => {
  await openLevelSelect(page);
  await expect(page.getByRole('button', { name: first.name })).toBeFocused();
  await expect(page.getByRole('button', { name: first.name }).locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
});

test('picking a map starts a new game on it, in the Build phase', async ({ page }) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: first.name }).click();

  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(page.getByRole('heading', { name: 'Select map' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start Wave' })).toBeEnabled();
  await expect(page.locator('#build-bar')).toBeVisible();
  await expect(page.getByTestId('hud-money')).toHaveText(`Money ${START_MONEY}`);
  expect(await state(page)).toMatchObject({
    mapId: first.id,
    phase: 'build',
    money: START_MONEY,
    lives: START_LIVES,
    towers: [],
  });
});

test('the Level select lists every map in registry order', async ({ page }) => {
  await openLevelSelect(page);
  await expect(page.locator('#level-select li button')).toHaveText([
    first.name,
    SECOND_MAP.name,
    THIRD_MAP.name,
    FOURTH_MAP.name,
  ]);
});

test('picking the second map starts a game on its Path, with its own waves', async ({ page }) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: SECOND_MAP.name }).click();

  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(page.getByRole('button', { name: 'Start Wave' })).toBeEnabled();
  expect(await state(page)).toMatchObject({
    mapId: SECOND_MAP.id,
    phase: 'build',
    totalWaves: SWITCHBACK_WAVES.length,
  });
  // Its Path enters on the top edge (column 2), where the first map's enters on the left.
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await page.evaluate(() => window.__TD__!.step(1));
  const [enemy] = (await state(page)).enemies;
  expect(enemy?.position.x).toBe(2.5);
  expect(enemy?.position.y).toBeLessThan(1);
});

test('Back returns to the Main menu', async ({ page }) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Select map' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Play' })).toBeFocused();
});

import { expect, test } from '@playwright/test';
import { TOWER_STATS, type TowerKind } from '../../src/data/towers';
import { clickTile, openGame, selectKind, state } from './helpers';

const KINDS = Object.keys(TOWER_STATS) as TowerKind[];
const FIRST = KINDS[0]!;
const BESIDE_PATH = { col: 1, row: 3 };

test('the build bar sits against the right edge of the window, beside the canvas', async ({ page }) => {
  await openGame(page);
  const canvas = await page.locator('#game canvas').boundingBox();
  const bar = await page.locator('#build-bar').boundingBox();
  if (!canvas || !bar) throw new Error('canvas or build bar missing');
  expect(bar.x).toBeGreaterThanOrEqual(canvas.x + canvas.width);
  expect(bar.x + bar.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bar.x + bar.width).toBeGreaterThan(page.viewportSize()!.width - 12);
  for (const kind of KINDS) await expect(page.getByTestId(`build-${kind}`)).toBeVisible();
});

test('no kind starts selected, and a click on a tile places nothing until one is', async ({ page }) => {
  await openGame(page);
  for (const kind of KINDS) await expect(page.getByTestId(`build-${kind}`)).toHaveAttribute('aria-pressed', 'false');
  await clickTile(page, BESIDE_PATH);
  expect((await state(page)).towers).toEqual([]);
});

test('clicking the selected kind again clears it', async ({ page }) => {
  await openGame(page);
  await page.getByTestId(`build-${FIRST}`).click();
  await page.getByTestId(`build-${FIRST}`).click();
  await expect(page.getByTestId(`build-${FIRST}`)).toHaveAttribute('aria-pressed', 'false');
  await clickTile(page, BESIDE_PATH);
  expect((await state(page)).towers).toEqual([]);
});

test('collapsing the build bar hides its buttons and gives the map the width', async ({ page }) => {
  await openGame(page);
  const before = (await page.locator('#game canvas').boundingBox())!;
  await page.getByTestId('build-bar-toggle').click();
  await expect(page.getByTestId(`build-${FIRST}`)).toBeHidden();
  await expect(page.getByTestId('build-bar-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(async () => (await page.locator('#game canvas').boundingBox())!.width)
    .toBeGreaterThan(before.width + 40);
  await page.getByTestId('build-bar-toggle').click();
  await expect(page.getByTestId(`build-${FIRST}`)).toBeVisible();
});

test('selecting the first kind, then a click on a tile places it', async ({ page }) => {
  await openGame(page);
  await selectKind(page, FIRST);
  await expect(page.getByTestId(`build-${FIRST}`)).toHaveAttribute('aria-pressed', 'true');
  await clickTile(page, BESIDE_PATH);
  expect((await state(page)).towers.map((t) => t.kind)).toEqual([FIRST]);
});

test('pressing 2 then clicking a tile places the second kind', async ({ page }) => {
  test.skip(KINDS.length < 2, 'Only one tower kind exists so far');
  // Assumes the second kind is affordable with the starting Money; if not, load a scenario with more.
  await openGame(page);
  await page.keyboard.press('2');
  await expect(page.getByTestId(`build-${KINDS[1]}`)).toHaveAttribute('aria-pressed', 'true');
  await clickTile(page, BESIDE_PATH);
  expect((await state(page)).towers.map((t) => t.kind)).toEqual([KINDS[1]]);
});

test('a kind the player cannot afford is disabled but stays selected', async ({ page }) => {
  await openGame(page);
  await selectKind(page, FIRST);
  const first = page.getByTestId(`build-${FIRST}`);
  await expect(first).toBeEnabled();
  // Spend Money on towers until the first kind is out of reach.
  const cost = TOWER_STATS[FIRST].cost;
  for (let col = 1; (await state(page)).money >= cost; col++) await clickTile(page, { col, row: 3 });
  await expect(first).toBeDisabled();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
});

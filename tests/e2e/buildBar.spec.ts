import { expect, test } from '@playwright/test';
import { BUILD_KINDS, TOWER_STATS, type TowerKind } from '../../src/data/towers';
import { clickTile, openGame, selectKind, state } from './helpers';

const KINDS: readonly TowerKind[] = BUILD_KINDS; // the kinds in play: a held-back one (the Sniper, #364) has no button
// Tower kinds drawn from a render (src/data/renders.ts). Not imported: Playwright can't load its PNG/JSON imports.
const RENDERED: TowerKind[] = ['aaGun'];
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

test('a kind the player cannot afford is disabled but stays selected, and a click on it clears it', async ({
  page,
}) => {
  await openGame(page);
  await selectKind(page, FIRST);
  const first = page.getByTestId(`build-${FIRST}`);
  await expect(first).toBeEnabled();
  // Spend Money on towers until the first kind is out of reach.
  const cost = TOWER_STATS[FIRST].cost;
  for (let col = 1; (await state(page)).money >= cost; col++) await clickTile(page, { col, row: 3 });
  await expect(first).toBeDisabled();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await first.click({ force: true }); // force: Playwright won't click an aria-disabled button, a player can
  await expect(first).toHaveAttribute('aria-pressed', 'false');
});

test("each build button shows the tower's sprite layers, not a coloured shape", async ({ page }) => {
  await openGame(page);
  for (const kind of KINDS) {
    const icon = page.getByTestId(`build-${kind}`).locator('.build-icon');
    await expect(icon.locator('.build-icon-layer')).toHaveCount(2);
    // Not Phaser's blob URL, which is revoked once the texture has loaded.
    await expect(icon.locator('.build-icon-layer').first()).not.toHaveCSS('background-image', /blob:/);
    await expect(icon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
});

test('a blocked atlas leaves the build bar with coloured shapes, except for kinds with their own render', async ({
  page,
}) => {
  await page.route(/\/sprites[^/]*\.(png|json)$/, (route) => route.abort());
  await openGame(page);
  for (const kind of KINDS) {
    const icon = page.getByTestId(`build-${kind}`).locator('.build-icon');
    if (RENDERED.includes(kind)) {
      // A render is separate PNGs, not part of the atlas, so its icon still loads.
      await expect(icon.locator('.build-icon-layer')).toHaveCount(2);
      await expect(icon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    } else {
      await expect(icon.locator('.build-icon-layer')).toHaveCount(0);
      await expect(icon).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  }
});

test('hovering a button shows its tooltip, left of the bar, and the button is described by it', async ({ page }) => {
  await openGame(page);
  const button = page.getByTestId('build-cannon');
  const tip = page.getByTestId('build-tip-cannon');
  await expect(tip).toBeHidden();
  await button.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Cannon');
  await expect(tip).toContainText(`Cost${TOWER_STATS.cannon.cost}`);
  await expect(tip).toContainText('HitsGround');
  await expect(button).toHaveAttribute('aria-describedby', 'build-tip-cannon');
  await expect(button).toHaveAccessibleDescription(/Slow, heavy shells/);
  const bar = (await page.locator('#build-bar').boundingBox())!;
  const box = (await tip.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(bar.x);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.mouse.move(10, 10);
  await expect(tip).toBeHidden();
});

test('keyboard focus shows the tooltip', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('build-aaGun').focus();
  await expect(page.getByTestId('build-tip-aaGun')).toBeVisible();
});

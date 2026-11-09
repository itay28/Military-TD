import { expect, test, type Page } from '@playwright/test';
import { openGame, state, view } from './helpers';

/** A free tile beside the Path on the first map. */
const BESIDE_PATH = { col: 1, row: 3 };

/** Moves the map cursor to `tile` with the arrow keys only, Shift+arrow for the long stretches. */
async function cursorTo(page: Page, { col, row }: { col: number; row: number }) {
  const move = async (delta: number, less: string, more: string) => {
    const key = delta < 0 ? less : more;
    for (let left = Math.abs(delta); left > 0; left -= left >= 4 ? 4 : 1)
      await page.keyboard.press(left >= 4 ? `Shift+${key}` : key);
  };
  const start = (await view(page)).cursor;
  await move(col - start.col, 'ArrowLeft', 'ArrowRight');
  await move(row - start.row, 'ArrowUp', 'ArrowDown');
  expect((await view(page)).cursor).toMatchObject({ col, row, shown: true });
}

/** Which part of the screen the focused element is in. */
const focusedRegion = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.closest('#hud, #build-bar, #game, #tower-panel, #enemy-card')?.id ?? 'none',
  );

test('wave 1 plays by keyboard only: pick, move the cursor, place, start the wave, upgrade', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('1');
  await expect(page.getByTestId('build-rifleNest')).toHaveAttribute('aria-pressed', 'true');
  // An arrow with nothing focused focuses the map and shows the cursor.
  await cursorTo(page, BESIDE_PATH);
  await expect(page.locator('#game')).toBeFocused();
  await expect(page.getByTestId('map-cursor-status')).toHaveText('Tile 2, 4: free');

  await page.keyboard.press('Enter');
  expect((await state(page)).towers).toMatchObject([{ kind: 'rifleNest', tile: BESIDE_PATH, level: 1 }]);
  await expect(page.getByTestId('map-cursor-status')).toHaveText('Rifle Nest, level 1');

  // Esc drops the picked kind, so Space is Start Wave again.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Space');
  expect(await state(page)).toMatchObject({ phase: 'wave', waveNumber: 1 });

  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Rifle Nest' })).toBeVisible();
  await page.keyboard.press('u');
  await expect(page.getByTestId('tower-level')).toHaveText('Level 2');
  await expect(page.getByTestId('map-cursor-status')).toHaveText('Rifle Nest, level 1');
  expect((await state(page)).towers).toMatchObject([{ level: 2 }]);
});

test('Space places at the cursor while a kind is picked, and WASD moves it only with nothing picked', async ({
  page,
}) => {
  await openGame(page);
  await page.keyboard.press('ArrowLeft');
  const start = (await view(page)).cursor;
  await page.keyboard.press('d');
  expect((await view(page)).cursor).toMatchObject({ col: start.col + 1, row: start.row });
  await page.keyboard.press('1');
  await page.keyboard.press('d');
  expect((await view(page)).cursor).toMatchObject({ col: start.col + 1, row: start.row });
  await cursorTo(page, BESIDE_PATH);
  await page.keyboard.press('Space');
  expect(await state(page)).toMatchObject({ phase: 'build', towers: [{ tile: BESIDE_PATH }] });
});

test('Tab goes HUD, build bar, map, then the open tower panel', async ({ page }) => {
  await openGame(page);
  await cursorTo(page, BESIDE_PATH);
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Rifle Nest' })).toBeVisible();

  // Tab round the whole page (the browser's own UI counts as "none"), then read the cycle from the HUD on.
  const regions: string[] = [];
  for (let i = 0; i < 100 && regions.filter((r) => r === 'hud').length < 2; i++) {
    await page.keyboard.press('Tab');
    const region = await focusedRegion(page);
    if (region !== regions.at(-1)) regions.push(region);
  }
  const cycle = regions.slice(regions.indexOf('hud')).filter((region) => region !== 'none');
  expect(cycle.slice(0, 5)).toEqual(['hud', 'build-bar', 'game', 'tower-panel', 'hud']);
});

test('the map shows a visible focus outline and the cursor only under keyboard focus', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('ArrowRight');
  const outline = await page.locator('#game').evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
  expect((await view(page)).cursor.shown).toBe(true);
  await page.locator('#hud button').first().focus();
  await expect.poll(async () => (await view(page)).cursor.shown).toBe(false);
});

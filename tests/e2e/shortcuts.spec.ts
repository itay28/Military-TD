import { expect, test, type Page } from '@playwright/test';
import { clickTile, openGame, selectKind, state } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };

const help = (page: Page) => page.getByRole('dialog', { name: 'Keys' });

/** Places a Rifle Nest beside the Path, then clicks it, so its panel is open. */
async function selectPlacedTower(page: Page) {
  await openGame(page);
  await selectKind(page);
  await clickTile(page, BESIDE_PATH);
  await clickTile(page, BESIDE_PATH);
  await expect(page.getByRole('dialog', { name: 'Rifle Nest' })).toBeVisible();
}

test('U upgrades the selected tower', async ({ page }) => {
  await selectPlacedTower(page);
  await page.keyboard.press('u');
  await expect(page.getByTestId('tower-level')).toHaveText('Level 2');
  expect((await state(page)).towers).toMatchObject([{ level: 2 }]);
});

test('S sells the selected tower', async ({ page }) => {
  await selectPlacedTower(page);
  await page.keyboard.press('s');
  await expect(page.getByTestId('tower-sell')).toHaveText('Dismantling…');
});

test('Space starts the wave', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Call next wave' })).toBeEnabled();
  expect(await state(page)).toMatchObject({ phase: 'wave', waveNumber: 1 });
});

test('F cycles the game speed', async ({ page }) => {
  await openGame(page);
  const pressed = page.getByTestId('game-speed').locator('[aria-pressed="true"]');
  await expect(pressed).toHaveText('×1');
  await page.keyboard.press('f');
  await expect(pressed).toHaveText('×2');
  await page.keyboard.press('f');
  await page.keyboard.press('f');
  await expect(pressed).toHaveText('×1');
});

test('P pauses and resumes', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
});

test('H opens the Keys help over the paused game, and Esc closes it back to the game', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('h');
  await expect(help(page)).toBeVisible();
  await expect(help(page).getByRole('row', { name: 'U Upgrade the selected tower' })).toBeVisible();
  // The help overlay owns the keyboard: F doesn't change the speed behind it.
  await page.keyboard.press('f');
  await expect(page.getByTestId('game-speed').locator('[aria-pressed="true"]')).toHaveText('×1');
  await page.keyboard.press('Escape');
  await expect(help(page)).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
});

test('the pause menu’s Keys button opens the help, and Back returns to the Paused dialog', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Keys' }).click();
  await expect(help(page)).toBeVisible();
  await help(page).getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
});

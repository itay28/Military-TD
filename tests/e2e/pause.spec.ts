import { expect, test, type Page } from '@playwright/test';
import { START_MONEY } from '../../src/data/start';
import { clickTile, openGame, playToEnd, selectKind, state } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };

const timeMs = async (page: Page) => (await state(page)).timeMs;
const pauseButton = (page: Page) => page.getByRole('button', { name: 'Pause' });
const pauseMenu = (page: Page) => page.getByRole('dialog', { name: 'Paused' });

/** Starts the first wave on the real-time loop and waits until the sim is running. */
async function midWave(page: Page) {
  await openGame(page, { manualStep: false });
  await page.getByRole('button', { name: 'Start Wave' }).click();
  await expect.poll(() => timeMs(page)).toBeGreaterThan(0);
}

test('Pause freezes the sim over real time, and Resume runs it again', async ({ page }) => {
  await midWave(page);
  await pauseButton(page).click();
  await expect(pauseMenu(page)).toBeVisible();

  const frozen = await timeMs(page);
  await page.waitForTimeout(500);
  expect(await timeMs(page)).toBe(frozen);
  expect((await state(page)).phase).toBe('wave');

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(pauseMenu(page)).toBeHidden();
  await expect.poll(() => timeMs(page)).toBeGreaterThan(frozen);
});

test('Esc pauses and Esc resumes', async ({ page }) => {
  await midWave(page);
  await page.keyboard.press('Escape');
  await expect(pauseMenu(page)).toBeVisible();
  const frozen = await timeMs(page);
  await page.waitForTimeout(300);
  expect(await timeMs(page)).toBe(frozen);

  await page.keyboard.press('Escape');
  await expect(pauseMenu(page)).toBeHidden();
  await expect.poll(() => timeMs(page)).toBeGreaterThan(frozen);
});

test('while paused, the map, the build bar and the shortcuts do nothing', async ({ page }) => {
  await openGame(page);
  await selectKind(page, 'rifleNest');
  await page.keyboard.press('Escape'); // clears the build kind first; it doesn't pause
  await expect(pauseMenu(page)).toBeHidden();
  await selectKind(page, 'rifleNest');
  await pauseButton(page).click();

  await clickTile(page, BESIDE_PATH);
  const rifle = page.getByTestId('build-rifleNest');
  const box = (await rifle.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(rifle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('2');
  await expect(rifle).toHaveAttribute('aria-pressed', 'true');
  expect(await state(page)).toMatchObject({ towers: [], money: START_MONEY });

  await page.getByRole('button', { name: 'Resume' }).click();
  await clickTile(page, BESIDE_PATH);
  expect((await state(page)).towers).toHaveLength(1);
});

test('Restart from the pause menu starts a new Build phase', async ({ page }) => {
  await midWave(page);
  await pauseButton(page).click();
  await page.getByRole('button', { name: 'Restart' }).click();

  await expect(pauseMenu(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start Wave' })).toBeEnabled();
  expect(await state(page)).toMatchObject({ phase: 'build', waveNumber: 0, money: START_MONEY });
});

test('Quit to menu is shown but disabled until it is wired to the Main menu (#46); Settings is enabled (#48)', async ({
  page,
}) => {
  await openGame(page);
  await pauseButton(page).click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Quit to menu' })).toBeDisabled();
});

test('pausing is unavailable once the game is over', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Start Wave' }).click();
  await playToEnd(page);
  await expect(page.getByRole('dialog', { name: /Victory|Defeat/ })).toBeVisible();
  await expect(pauseButton(page)).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(pauseMenu(page)).toBeHidden();
});

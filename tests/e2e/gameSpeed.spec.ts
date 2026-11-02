import { expect, test, type Page } from '@playwright/test';
import { openGame, playToEnd, state } from './helpers';

/** Sim time per real ms over `realMs` of real-time play, measured in the page. */
async function simRate(page: Page, realMs = 1000): Promise<number> {
  const start = await page.evaluate(() => ({ sim: window.__TD__!.state().timeMs, real: performance.now() }));
  await page.waitForTimeout(realMs);
  const end = await page.evaluate(() => ({ sim: window.__TD__!.state().timeMs, real: performance.now() }));
  return (end.sim - start.sim) / (end.real - start.real);
}

// From #50: the speed button scales how much sim time each real frame feeds the fixed step.
test('at ×3 the game runs about three times as fast as at ×1', async ({ page }) => {
  await openGame(page, { manualStep: false });
  const speed = page.getByRole('group', { name: 'Game speed' });
  await expect(speed.getByRole('button', { name: '×1' })).toHaveAttribute('aria-pressed', 'true');
  const atX1 = await simRate(page);

  await speed.getByRole('button', { name: '×3' }).click();
  await expect(speed.getByRole('button', { name: '×3' })).toHaveAttribute('aria-pressed', 'true');
  const atX3 = await simRate(page);

  // Frame timing in a headless browser jitters, so the ratio only needs to be near 3.
  expect(atX3 / atX1).toBeGreaterThan(2.25);
  expect(atX3 / atX1).toBeLessThan(3.75);
});

test('manual stepping feeds no time at ×3', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('game-speed-3').click();
  await page.waitForTimeout(200);
  expect((await state(page)).timeMs).toBe(0);
});

test('one click on the HUD picks any speed, down as well as up', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('game-speed-3').click();
  await page.getByTestId('game-speed-1').click();
  await expect(page.getByTestId('game-speed-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('game-speed-3')).toHaveAttribute('aria-pressed', 'false');
});

test('while paused, the Paused dialog changes the speed and the HUD shows it after Resume', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByTestId('pause-speed-1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pause-speed-2').click();
  await expect(page.getByTestId('pause-speed-2')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('game-speed-2')).toHaveAttribute('aria-pressed', 'true');
});

test('Restart puts the game back to ×1', async ({ page }) => {
  await openGame(page);
  await page.getByTestId('game-speed-2').click();
  await expect(page.getByTestId('game-speed-2')).toHaveAttribute('aria-pressed', 'true');

  await playToEnd(page);
  await expect(page.getByTestId('game-speed-2')).toBeDisabled();
  await page.getByRole('button', { name: 'Restart' }).click();

  await expect(page.getByTestId('game-speed-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('game-speed-1')).toBeEnabled();
});

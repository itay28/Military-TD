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
  const speed = page.getByRole('button', { name: /^Game speed/ });
  await expect(speed).toHaveText('×1');
  const atX1 = await simRate(page);

  await speed.click();
  await speed.click();
  await expect(speed).toHaveAccessibleName('Game speed ×3');
  const atX3 = await simRate(page);

  // Frame timing in a headless browser jitters, so the ratio only needs to be near 3.
  expect(atX3 / atX1).toBeGreaterThan(2.25);
  expect(atX3 / atX1).toBeLessThan(3.75);
});

test('manual stepping feeds no time at ×3', async ({ page }) => {
  await openGame(page);
  const speed = page.getByRole('button', { name: /^Game speed/ });
  await speed.click();
  await speed.click();
  await page.waitForTimeout(200);
  expect((await state(page)).timeMs).toBe(0);
});

test('Restart puts the game back to ×1', async ({ page }) => {
  await openGame(page);
  const speed = page.getByRole('button', { name: /^Game speed/ });
  await speed.click();
  await expect(speed).toHaveText('×2');

  await playToEnd(page);
  await expect(speed).toBeDisabled();
  await page.getByRole('button', { name: 'Restart' }).click();

  await expect(speed).toHaveText('×1');
  await expect(speed).toBeEnabled();
});

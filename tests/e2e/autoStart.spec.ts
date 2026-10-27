import { expect, test } from '@playwright/test';
import { TICK_MS } from '../../src/sim/game';
import { AUTO_START_DELAY_MS } from '../../src/data/waves';
import { openGame, state, stepToEnd } from './helpers';

const DELAY_TICKS = Math.round(AUTO_START_DELAY_MS / TICK_MS);

// From #241: with the toggle on, the next wave starts by itself AUTO_START_DELAY_MS of game time after a clear.
test('with Auto-start on, wave 2 starts by itself AUTO_START_DELAY_MS after wave 1 is cleared', async ({ page }) => {
  await openGame(page);
  const toggle = page.getByRole('button', { name: 'Auto-start' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Start Wave' }).click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // No towers: wave 1's Infantry all leak, which clears it. Step one tick at a time so we stop on the clear.
  const cleared = await page.evaluate(() => {
    const td = window.__TD__!;
    while (td.state().phase === 'wave') td.step(1);
    return td.state();
  });
  expect(cleared).toMatchObject({ phase: 'build', waveNumber: 1, autoStart: true });
  // The countdown shows once the "Wave 1 cleared" banner is down.
  await expect(page.getByTestId('wave-banner')).toHaveText('Wave 1 cleared');
  await expect(page.getByTestId('hud-next-wave')).toHaveText('');

  const before = await page.evaluate((ticks) => window.__TD__!.step(ticks), DELAY_TICKS - 1);
  expect(before).toMatchObject({ phase: 'build', waveNumber: 1 });
  await expect(page.getByTestId('hud-next-wave')).toHaveText('Next wave in 1');

  const after = await page.evaluate(() => window.__TD__!.step(1));
  expect(after).toMatchObject({ phase: 'wave', waveNumber: 2 });
  await expect(page.getByTestId('hud-next-wave')).toHaveText('');
  await expect(page.getByTestId('hud-wave')).toHaveText(/^Wave 2 \//);
});

test('Restart starts a new game with Auto-start off', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Auto-start' }).click();
  // Auto-start plays every wave with no towers, so the game ends in Defeat.
  expect((await stepToEnd(page)).phase).toBe('defeat');
  await page.getByRole('button', { name: 'Restart' }).click();

  await expect(page.getByRole('button', { name: 'Auto-start' })).toHaveAttribute('aria-pressed', 'false');
  expect(await state(page)).toMatchObject({ phase: 'build', waveNumber: 0, autoStart: false });
});

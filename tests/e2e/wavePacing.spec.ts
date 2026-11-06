import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_WAVE_AFTER_MS } from '../../src/data/waves';
import { TICK_MS } from '../../src/sim/game';
import { openGame, state, stepToEnd } from './helpers';

// From #413 (ADR-0011): waves come on their timers by default; Tactical mode waits for the player and caps Stars at 2.

const TIMER_TICKS = Math.round(DEFAULT_WAVE_AFTER_MS / TICK_MS);
const step = (page: Page, ticks: number) => page.evaluate((n) => window.__TD__!.step(n), ticks);

/** Turns Tactical mode on from the pause menu's Settings, then restarts so the next game uses it. */
async function turnOnTactical(page: Page) {
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Tactical mode' }).check();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
}

test('timed mode: wave 1 arrives by itself when the build window runs out', async ({ page }) => {
  await openGame(page);
  await expect(page.getByTestId('start-wave')).toHaveText('Call next wave');
  await expect(page.getByTestId('hud-next-wave')).toHaveText(`Next ${DEFAULT_WAVE_AFTER_MS / 1000}s`);

  expect(await step(page, TIMER_TICKS - 1)).toMatchObject({ phase: 'build', waveNumber: 0 });
  await expect(page.getByTestId('hud-next-wave')).toHaveText('Next 1s');
  expect(await step(page, 1)).toMatchObject({ phase: 'wave', waveNumber: 1 });
  await expect(page.getByTestId('hud-wave')).toHaveText(/^Wave 1 \//);
  // The countdown to wave 2 stays up during wave 1.
  await expect(page.getByTestId('hud-next-wave')).toHaveText(/^Next \d+s$/);
});

test('timed mode: calling a wave in starts it now, overlapping the one on the field, and restarts the timer', async ({
  page,
}) => {
  await openGame(page);
  await page.getByTestId('start-wave').click();
  await step(page, 60);
  await page.getByTestId('start-wave').click();

  const now = await state(page);
  expect(now).toMatchObject({ phase: 'wave', waveNumber: 2, activeWaves: [1, 2] });
  expect(now.nextWaveAtMs).toBe(now.timeMs + DEFAULT_WAVE_AFTER_MS);
  await expect(page.getByTestId('hud-wave')).toHaveText(/^Waves 1–2 \//);
});

// The countdown shares the HUD's one-line message slot (#274), so it has to fit there, overlap counter and all.
for (const viewport of [
  { width: 900, height: 560 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test(`on ${viewport.width} × ${viewport.height}, the countdown fits whole beside "Waves 1–2 / 10"`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    await page.getByTestId('start-wave').click();
    await page.getByTestId('start-wave').click();
    await expect(page.getByTestId('hud-wave')).toHaveText(/^Waves 1–2 \//);
    await expect(page.getByTestId('hud-next-wave')).toHaveText(/^Next \d+s$/);
    // Nothing else is in the slot yet (no banner), so any overflow is the countdown being cut off.
    const fits = await page.evaluate(() => {
      const slot = document.querySelector<HTMLElement>('#hud .hud-message')!;
      return slot.scrollWidth <= slot.clientWidth;
    });
    expect(fits).toBe(true);
  });
}

test('Tactical mode: no timer, and a wave starts only when the player calls it', async ({ page }) => {
  await openGame(page);
  await turnOnTactical(page);
  await expect(page.getByTestId('start-wave')).toHaveText('Start Wave');
  await expect(page.getByTestId('hud-next-wave')).toHaveText('');

  expect(await step(page, TIMER_TICKS * 3)).toMatchObject({ phase: 'build', waveNumber: 0, tacticalMode: true });
  await page.getByTestId('start-wave').click();
  expect(await state(page)).toMatchObject({ phase: 'wave', waveNumber: 1 });
  // Mid-wave the next one can't be called.
  await expect(page.getByTestId('start-wave')).toBeDisabled();
});

test('Tactical mode: a win with no Lives lost shows 2 of 3 stars and says why', async ({ page }) => {
  await openGame(page);
  await turnOnTactical(page);
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'callNextWave' }));
  const end = await stepToEnd(page);
  expect(end).toMatchObject({ phase: 'victory', lives: 20, tacticalMode: true });

  await expect(page.getByTestId('stars')).toHaveText('★★☆ 2 of 3 stars');
  await expect(page.getByTestId('tactical-cap')).toHaveText('Tactical: max 2 stars');
});

import { expect, test } from '@playwright/test';
import { openGame, state } from './helpers';

// #243: after a wave fought by a Rifle Nest and a Cannon, the DPS meter lists both kinds, each with its tower.
test('the DPS meter lists both kinds with their towers after a wave', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('two-tower-kinds'));
  const { towers } = await state(page);
  const rifleNest = towers.find((t) => t.kind === 'rifleNest')!;
  const cannon = towers.find((t) => t.kind === 'cannon')!;

  await page.getByRole('button', { name: 'Start Wave' }).click();
  let now = await page.evaluate(() => window.__TD__!.step(1));
  while (now.phase === 'wave') now = await page.evaluate(() => window.__TD__!.step(60));
  expect(now.waveNumber).toBe(1);

  const meter = page.getByTestId('dps-meter');
  await expect(meter).toBeHidden();
  await page.getByTestId('hud-dps').click();
  await expect(meter).toBeVisible();
  await expect(meter.locator('[data-kind]')).toHaveCount(2);
  await expect(meter.getByTestId('dps-kind-name-rifleNest')).toHaveText('Rifle Nest');
  await expect(meter.getByTestId('dps-kind-name-cannon')).toHaveText('Cannon');
  for (const [kind, tower] of [
    ['rifleNest', rifleNest],
    ['cannon', cannon],
  ] as const) {
    const rows = meter.getByTestId(`dps-towers-${kind}`).locator('[data-tower-id]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-tower-id', String(tower.id));
    await expect(rows.first()).toHaveText(new RegExp(`^#${tower.id} Lv 1 · [1-9]\\d* DPS`));
  }

  await page.getByTestId('hud-dps').click();
  await expect(meter).toBeHidden();
});

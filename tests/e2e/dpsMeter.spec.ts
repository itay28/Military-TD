import { expect, test } from '@playwright/test';
import { openGame, state, view } from './helpers';

// #243: after a wave fought by a Rifle Nest and a Cannon, the DPS meter lists both kinds, each with its tower.
test('the DPS meter lists both kinds with their towers after a wave', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('two-tower-kinds'));
  const { towers } = await state(page);
  const rifleNest = towers.find((t) => t.kind === 'rifleNest')!;
  const cannon = towers.find((t) => t.kind === 'cannon')!;

  await page.getByRole('button', { name: 'Call next wave' }).click();
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

// #244: rows are buttons. A kind row highlights its towers on the map; a tower row selects that tower.
test('clicking a kind row highlights its towers, and a tower row selects that tower', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('two-tower-kinds'));
  // A second Rifle Nest, so a kind has two towers and the highlight has something to leave out.
  const placed = await page.evaluate(() =>
    window.__TD__!.command({ type: 'placeTower', kind: 'rifleNest', tile: { col: 1, row: 5 } }),
  );
  expect(placed.ok).toBe(true);
  const { towers } = await state(page);
  const rifleIds = towers.filter((t) => t.kind === 'rifleNest').map((t) => t.id);
  const cannon = towers.find((t) => t.kind === 'cannon')!;
  expect(rifleIds).toHaveLength(2);

  await page.getByTestId('hud-dps').click();
  const meter = page.getByTestId('dps-meter');
  await expect(meter).toBeVisible();
  expect((await view(page)).highlight).toEqual({ kind: null, towerIds: [] });

  const rifleRow = meter.getByRole('button', { name: 'Highlight all Rifle Nests' });
  await rifleRow.click();
  await expect(rifleRow).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await view(page)).highlight).toEqual({ kind: 'rifleNest', towerIds: rifleIds });

  // Another kind replaces it, and a second click clears it.
  const cannonRow = meter.getByRole('button', { name: 'Highlight all Cannons' });
  await cannonRow.click();
  await expect(rifleRow).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await view(page)).highlight).toEqual({ kind: 'cannon', towerIds: [cannon.id] });
  await cannonRow.click();
  await expect.poll(async () => (await view(page)).highlight).toEqual({ kind: null, towerIds: [] });

  // Escape clears it too.
  await rifleRow.click();
  await expect.poll(async () => (await view(page)).highlight.kind).toBe('rifleNest');
  await page.keyboard.press('Escape');
  await expect(rifleRow).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await view(page)).highlight.kind).toBeNull();

  // A tower row selects that tower: its panel opens and its range ring shows.
  await meter.getByRole('button', { name: `Select Cannon #${cannon.id}` }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: 'Cannon' })).toBeVisible();
  await expect.poll(async () => (await view(page)).rangeRings).toEqual([cannon.id]);
});

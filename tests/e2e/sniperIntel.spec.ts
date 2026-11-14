import { expect, test, type Page } from '@playwright/test';
import { ENEMY_NAMES } from '../../src/data/display';
import { WAVES } from '../../src/data/waves';
import { waveComposition } from '../../src/sim/intel';
import { openGame, view } from './helpers';

const SNIPER_TILE = { col: 1, row: 3 };

/** The chips the HUD shows for wave `n` (from 1) of the first map, from the schedule. */
const expectedChips = (n: number) =>
  waveComposition(WAVES[n - 1]!).map(({ kind, count }) => `${count} ${ENEMY_NAMES[kind]}`);

const chips = (page: Page, wave: number) =>
  page.locator(`[data-testid="intel-wave"][data-wave="${wave}"] [data-testid="intel-kind"]`);

test('Sniper intel (#353): no preview without a Sniper, then a Sniper shows the next wave and a level-3 Sniper the one after', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('sniper-intel'));
  const intel = page.getByTestId('hud-intel');
  await expect(intel).toBeVisible();
  await expect(page.getByTestId('intel-hint')).toHaveText('Build a Sniper for intel');
  await expect(page.getByTestId('intel-wave')).toHaveCount(0);
  expect((await view(page)).intel).toEqual({ waves: [], hint: true });

  const placed = await page.evaluate(
    (tile) => window.__TD__!.command({ type: 'placeTower', kind: 'sniper', tile }),
    SNIPER_TILE,
  );
  expect(placed.ok).toBe(true);
  await expect(page.getByTestId('intel-hint')).toBeHidden();
  await expect(chips(page, 1)).toHaveText(expectedChips(1));
  await expect(page.getByTestId('intel-wave')).toHaveCount(1);
  await expect
    .poll(async () => (await view(page)).intel.waves)
    .toEqual([{ waveNumber: 1, composition: waveComposition(WAVES[0]!) }]);

  // Hovering a kind shows its weakness line.
  await chips(page, 1).first().hover();
  await expect(page.getByTestId('intel-tip')).toContainText('Armor 0.');

  const towerId = (await page.evaluate(() => window.__TD__!.state())).towers[0]!.id;
  for (let i = 0; i < 2; i++)
    expect(
      await page.evaluate((id) => window.__TD__!.command({ type: 'upgradeTower', towerId: id }), towerId),
    ).toMatchObject({ ok: true });
  await expect(page.getByTestId('intel-wave')).toHaveCount(2);
  await expect(chips(page, 2)).toHaveText(expectedChips(2));

  // In timed mode it stays up during a wave, for the next wave to arrive.
  await page.evaluate(() => window.__TD__!.command({ type: 'callNextWave' }));
  await expect(chips(page, 2)).toHaveText(expectedChips(2));
  await expect(chips(page, 3)).toHaveText(expectedChips(3));
});

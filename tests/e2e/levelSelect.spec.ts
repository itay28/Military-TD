import { expect, test } from '@playwright/test';
import { FIRST_MAP, FOURTH_MAP, SECOND_MAP, THIRD_MAP } from './firstMap';
import { START_LIVES, START_MONEY } from '../../src/data/start';
import { SWITCHBACK_WAVES } from '../../src/data/waves';
import { openLevelSelect, state } from './helpers';

// From #51: Main menu → Play → Level select → Game on the chosen map; Back returns to the Main menu.

const first = FIRST_MAP;

test('the Level select shows each map as a button with a preview, the first focused', async ({ page }) => {
  await openLevelSelect(page);
  await expect(page.getByRole('button', { name: `${first.name}, no stars yet` })).toBeFocused();
  await expect(page.getByRole('button', { name: `${first.name}, no stars yet` }).locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
});

test('with fresh progress only the first map can be picked, with no stars yet; each later one is locked', async ({
  page,
}) => {
  await openLevelSelect(page);
  await expect(page.getByRole('button', { name: `${first.name}, no stars yet` })).not.toHaveAttribute('aria-disabled');
  await expect(page.getByRole('button', { name: `${SECOND_MAP.name}, locked` })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('with ?unlock=all every map can be picked', async ({ page }) => {
  await openLevelSelect(page, { unlockAll: true });
  for (const map of [FIRST_MAP, SECOND_MAP, THIRD_MAP, FOURTH_MAP]) {
    await expect(page.getByRole('button', { name: `${map.name}, no stars yet` })).not.toHaveAttribute('aria-disabled');
  }
  await expect(page.locator('#level-select [aria-disabled]')).toHaveCount(0);
});

test('a map’s best stars from saved progress show on its button', async ({ page }) => {
  await openLevelSelect(page, { progress: { [first.id]: { completed: true, bestStars: 2 } } });
  const map = page.getByRole('button', { name: `${first.name}, 2 of 3 stars` });
  await expect(map.getByTestId('stars')).toHaveText('★★☆');
  // Focus starts on the last unlocked map: winning the first map opens the second.
  await expect(page.getByRole('button', { name: `${SECOND_MAP.name}, no stars yet` })).toBeFocused();
});

test('a map card shows its aerial ground image under the tactical overlay (#401)', async ({ page }) => {
  await openLevelSelect(page);
  const ground = page.getByRole('button', { name: `${first.name}, no stars yet` }).getByTestId('map-ground');
  await expect(ground).toBeVisible();
  // The image loaded: a broken one has no natural size.
  await expect.poll(() => ground.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('picking a map opens its briefing; Back returns to the cards with that map focused (#401)', async ({ page }) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: `${first.name}, no stars yet` }).click();

  const briefing = page.getByRole('region', { name: 'Operation First Light' });
  await expect(briefing).toBeVisible();
  await expect(briefing.getByTestId('briefing-grid')).toHaveText(`${first.name} · HQ grid D2`);
  await expect(briefing.getByRole('button', { name: 'Deploy', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: `${first.name}, no stars yet` })).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(briefing).toBeHidden();
  await expect(page.getByRole('button', { name: `${first.name}, no stars yet` })).toBeFocused();

  await page.keyboard.press('Enter');
  await briefing.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(briefing).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
});

test('picking a map and pressing Deploy on its briefing starts a new game on it, in the Build phase', async ({
  page,
}) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: `${first.name}, no stars yet` }).click();
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();

  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Call next wave' })).toBeEnabled();
  await expect(page.locator('#build-bar')).toBeVisible();
  await expect(page.getByTestId('hud-money')).toHaveText(`Funds $${START_MONEY}`);
  expect(await state(page)).toMatchObject({
    mapId: first.id,
    phase: 'build',
    money: START_MONEY,
    lives: START_LIVES,
    towers: [],
  });
});

test('the Level select lists every map in registry order', async ({ page }) => {
  await openLevelSelect(page);
  await expect(page.locator('#level-select li button')).toHaveText([
    ...[first, SECOND_MAP, THIRD_MAP, FOURTH_MAP].map(({ name }) => new RegExp(`^${name}`)),
  ]);
});

test('picking the second map starts a game on its Path, with its own waves', async ({ page }) => {
  await openLevelSelect(page, { unlockAll: true });
  await page.getByRole('button', { name: `${SECOND_MAP.name}, no stars yet` }).click();
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();

  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(page.getByRole('button', { name: 'Call next wave' })).toBeEnabled();
  expect(await state(page)).toMatchObject({
    mapId: SECOND_MAP.id,
    phase: 'build',
    totalWaves: SWITCHBACK_WAVES.length,
  });
  // Its Path enters on the top edge (column 2), where the first map's enters on the left.
  await page.evaluate(() => window.__TD__!.command({ type: 'callNextWave' }));
  await page.evaluate(() => window.__TD__!.step(1));
  const [enemy] = (await state(page)).enemies;
  expect(enemy?.position.x).toBe(2.5);
  expect(enemy?.position.y).toBeLessThan(1);
});

test('Back returns to the Main menu', async ({ page }) => {
  await openLevelSelect(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Operations' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Deploy', exact: true })).toBeFocused();
});

test('on a phone the briefing fits the width and Deploy is on screen (#401)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openLevelSelect(page);
  await page.getByRole('button', { name: `${first.name}, no stars yet` }).click();
  const briefing = page.getByTestId('briefing');
  const box = await briefing.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await expect(briefing.getByRole('button', { name: 'Deploy', exact: true })).toBeInViewport();
});

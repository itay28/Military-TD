import { expect, test, type Page } from '@playwright/test';
import { MAPS } from '../../src/data/maps';
import { openGame, openMenu, state, view } from './helpers';

// From #48: the Settings screen, opened from the Main menu or the pause menu, and both settings taking effect.

const settingsDialog = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const speedButton = (page: Page) => page.getByRole('button', { name: /^Game speed/ });

async function openSettingsFromPause(page: Page) {
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(settingsDialog(page)).toBeVisible();
}

test('Settings on the Main menu opens the Settings screen, and Back returns to the menu', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(settingsDialog(page)).toBeVisible();
  await expect(page.getByRole('radio', { name: '×1' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Always show tower ranges' })).not.toBeChecked();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(settingsDialog(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('Settings on the pause menu opens the Settings screen, and Back (or Esc) returns to the paused game', async ({
  page,
}) => {
  await openGame(page);
  await openSettingsFromPause(page);
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(settingsDialog(page)).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.keyboard.press('Escape');
  await expect(settingsDialog(page)).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
});

test('a new game from the Main menu starts at the default game speed', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: '×2' }).check();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: MAPS[0]!.name }).click();

  await expect(speedButton(page)).toHaveAccessibleName('Game speed ×2');
});

test('a changed default applies from the next game: Restart starts at it, the running game keeps its speed', async ({
  page,
}) => {
  await openGame(page);
  await openSettingsFromPause(page);
  await page.getByRole('radio', { name: '×3' }).check();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(speedButton(page)).toHaveAccessibleName('Game speed ×1');

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(speedButton(page)).toHaveAccessibleName('Game speed ×3');
});

test('Always show tower ranges draws every tower’s range ring, live', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('every-tower-kind'));
  const ids = (await state(page)).towers.map((tower) => tower.id).sort((a, b) => a - b);
  expect(ids.length).toBeGreaterThan(1);
  // Nothing is hovered or selected, so no ring shows.
  await expect.poll(async () => (await view(page)).rangeRings).toEqual([]);

  await openSettingsFromPause(page);
  await page.getByRole('checkbox', { name: 'Always show tower ranges' }).check();
  await expect.poll(async () => (await view(page)).rangeRings).toEqual(ids);

  await page.getByRole('checkbox', { name: 'Always show tower ranges' }).uncheck();
  await expect.poll(async () => (await view(page)).rangeRings).toEqual([]);
});

// From #49: settings are saved to localStorage. Test mode keeps them in memory unless `persist=1`.

test('a changed setting is still set after a reload (persist=1)', async ({ page }) => {
  await openGame(page, { persist: true });
  await openSettingsFromPause(page);
  await page.getByRole('radio', { name: '×2' }).check();
  await page.getByRole('checkbox', { name: 'Always show tower ranges' }).check();

  await openGame(page, { persist: true });
  await openSettingsFromPause(page);
  await expect(page.getByRole('radio', { name: '×2' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Always show tower ranges' })).toBeChecked();
});

test('test mode keeps settings in memory by default, so runs do not leak into each other', async ({ page }) => {
  await openGame(page);
  await openSettingsFromPause(page);
  await page.getByRole('radio', { name: '×3' }).check();

  await openGame(page);
  await openSettingsFromPause(page);
  await expect(page.getByRole('radio', { name: '×1' })).toBeChecked();
});

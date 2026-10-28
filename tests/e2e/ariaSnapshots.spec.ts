import { expect, test, type Locator } from '@playwright/test';
import { openGame, openLevelSelect, openMenu, selectKind, stepToEnd } from './helpers';

// The HUD, build bar, menus, Level select and Settings screen are DOM, so they are checked as text, not pixels: these snapshots run everywhere, not only in
// CI's container. To update them: `npx playwright test ariaSnapshots --update-snapshots`, then commit the .aria.yml
// files (docs/agents/workflow.md → Aria snapshots).

/**
 * Compares `locator`'s aria snapshot with the file `name`, as exact text. `toMatchAriaSnapshot` would write numbers as
 * `\d+` patterns on update, so a changed cost or Money would still pass.
 */
async function expectAria(locator: Locator, name: string) {
  expect(`${await locator.ariaSnapshot()}\n`).toMatchSnapshot([name]);
}

test('the HUD at the start shows Money, Lives, Wave, DPS and a Start Wave button that is not disabled', async ({
  page,
}) => {
  await openGame(page);
  await expectAria(page.locator('#hud'), 'hud-initial.aria.yml');
});

test('the build bar at the start lists every tower with its cost, none selected, the unaffordable ones disabled', async ({
  page,
}) => {
  await openGame(page);
  await expectAria(page.locator('#build-bar'), 'build-bar-initial.aria.yml');
});

test('the build bar marks the selected tower', async ({ page }) => {
  await openGame(page);
  await selectKind(page, 'rifleNest');
  await expectAria(page.locator('#build-bar'), 'build-bar-selected.aria.yml');
});

test('the pause menu offers Resume, Restart, Settings, and Quit to menu disabled until it is wired', async ({
  page,
}) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expectAria(page.locator('#pause-menu'), 'pause-menu.aria.yml');
});

test('the Main menu shows the title, Play, and Settings', async ({ page }) => {
  await openMenu(page);
  await expectAria(page.locator('#menu'), 'menu-initial.aria.yml');
});

test('the Settings screen shows the default game speed choices, the range setting and Back', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expectAria(page.locator('#settings'), 'settings-screen.aria.yml');
});

test('the Level select lists each map by name and best stars, then Back', async ({ page }) => {
  await openLevelSelect(page);
  await expectAria(page.locator('#level-select'), 'level-select-initial.aria.yml');
});

test('the End screen after a won one-wave game shows the result and the damage report tables', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await stepToEnd(page);
  await expectAria(page.locator('#end-screen'), 'end-screen-victory.aria.yml');
});

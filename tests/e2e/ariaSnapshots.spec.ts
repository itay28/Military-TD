import { expect, test, type Locator } from '@playwright/test';
import { openGame, openMenu, selectKind } from './helpers';

// The HUD, build bar and Main menu are DOM, so they are checked as text, not pixels: these snapshots run everywhere, not only in
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

test('the Main menu shows the title, Play, and Settings disabled', async ({ page }) => {
  await openMenu(page);
  await expectAria(page.locator('#menu'), 'menu-initial.aria.yml');
});

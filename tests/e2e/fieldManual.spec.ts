import { expect, test, type Page } from '@playwright/test';
import { openGame, openMenu } from './helpers';

const manual = (page: Page) => page.getByRole('dialog', { name: 'Field manual' });
const model = (page: Page) => manual(page).getByRole('img');
const angleOf = async (page: Page) => Number(await model(page).getAttribute('data-angle'));

test('from the Main menu: pick the Tank, turn it, switch faction, and go back', async ({ page }) => {
  // A win on the first map: its enemy kinds are met.
  await openMenu(page, { progress: { mvp: { completed: true, bestStars: 3 } } });
  await page.getByRole('button', { name: 'Field manual' }).click();
  await expect(manual(page)).toBeVisible();
  // The first tower is open; ↓ goes through the list.
  await expect(manual(page).getByRole('heading', { name: 'Rifle Nest' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(manual(page).getByRole('heading', { name: 'AA Gun' })).toBeVisible();

  await manual(page).getByRole('button', { name: 'Tank' }).click();
  await expect(manual(page).getByRole('heading', { name: 'Tank', exact: true })).toBeVisible();
  await expect(manual(page).locator('dl')).toContainText('Leak cost');
  await expect(model(page)).toHaveAttribute('aria-label', 'Tank, US model');
  // The model loads (the US turntable sheet, #440), and the placeholder goes.
  await expect(model(page).locator('img')).toHaveAttribute('src', /us-tank-turntable.*\.webp/);
  await expect(manual(page).locator('.fm-loading')).toBeHidden();

  // Turn it: drag, then the arrow keys. A turn stops the spin, so the angle holds.
  const box = (await model(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const dragged = await angleOf(page);
  await model(page).focus();
  await page.keyboard.press('ArrowRight');
  expect(await angleOf(page)).toBe((dragged + 15) % 360);

  await manual(page).getByRole('button', { name: 'Russia' }).click();
  await expect(manual(page).getByRole('button', { name: 'Russia' })).toHaveAttribute('aria-pressed', 'true');
  await expect(model(page)).toHaveAttribute('aria-label', 'Tank, Russia model');
  await expect(model(page).locator('img')).toHaveAttribute('src', /russia-tank/);

  await page.keyboard.press('Escape');
  await expect(manual(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Field manual' })).toBeFocused();
});

test('an enemy never met stays classified', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Field manual' }).click();
  await manual(page).getByRole('button', { name: 'Classified' }).first().click();
  await expect(manual(page)).toContainText('CLASSIFIED: no contact yet');
  await expect(manual(page).locator('dl')).toHaveCount(0);
  await expect(manual(page).getByRole('group', { name: 'Faction' })).toBeHidden();
});

test('spins on its own, but not with reduced motion', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: 'Field manual' }).click();
  await expect.poll(() => angleOf(page)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Field manual' }).click();
  await page.waitForTimeout(500);
  expect(await angleOf(page)).toBe(0);
});

test('from the pause menu: enemies met in this game unlock, the game stays paused, and Esc goes back to Paused', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.command({ type: 'callNextWave' }));
  await expect.poll(() => page.evaluate(() => window.__TD__!.step(500).enemies.length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Field manual' }).click();
  await expect(manual(page)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
  // The first map's first wave is Infantry.
  await manual(page).getByRole('button', { name: 'Infantry' }).click();
  await expect(manual(page).locator('dl')).toContainText('HP');
  await page.keyboard.press('Escape');
  await expect(manual(page)).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await expect(page.getByTestId('field-manual')).toBeFocused();
});

test('fits a phone: the model on top, the information under it, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 760 });
  await openMenu(page, { progress: { mvp: { completed: true, bestStars: 3 } } });
  await page.getByRole('button', { name: 'Field manual' }).click();
  const modelBox = (await model(page).boundingBox())!;
  const infoBox = (await manual(page).locator('.fm-info').boundingBox())!;
  expect(modelBox.y + modelBox.height).toBeLessThanOrEqual(infoBox.y);
  expect(modelBox.x + modelBox.width).toBeLessThanOrEqual(400);
  const overflow = await manual(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

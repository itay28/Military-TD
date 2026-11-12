import { expect, test, type Page } from '@playwright/test';
import { FIRST_MAP } from './firstMap';
import { freezeBackdrop, openMenu } from './helpers';

// From #568: the menu clip's video plays behind the Main menu and the Level select, on loop, with its muffled battle
// sound on the sound effects channel. There is no live battlefield (no Game scene) behind the menu any more. Test mode
// shows a flat background unless ?backdrop=1.

const root = (page: Page) => page.locator('html');
const video = (page: Page) => page.locator('#menu-backdrop video');
const playing = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) => !v.paused && v.loop && v.currentTime > 0 && v.readyState >= 2);
const audio = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) => ({ muted: v.muted, volume: Math.round(v.volume * 100) / 100 }));

test('without ?backdrop=1 test mode shows the menu on a flat background, with no video', async ({ page }) => {
  await openMenu(page);
  await expect(root(page)).not.toHaveAttribute('data-backdrop');
  await expect(page.locator('#menu-backdrop')).toBeHidden();
  await expect(page.locator('#menu')).toHaveCSS('background-color', 'rgb(27, 30, 22)');
});

test('the clip plays on loop behind a see-through menu and the Level select, and no battle runs on the canvas', async ({
  page,
}) => {
  await openMenu(page, { backdrop: true });
  await expect(root(page)).toHaveAttribute('data-backdrop', 'video');
  await expect.poll(() => playing(page)).toBe(true);
  await expect(page.locator('#menu')).toHaveCSS('background-image', /radial-gradient/);
  await expect(page.getByRole('button', { name: 'Deploy', exact: true })).toBeFocused();
  // No Game scene behind the menu: the canvas under the video doesn't change.
  const canvas = page.locator('#game canvas');
  const before = await canvas.screenshot();
  await page.waitForTimeout(500);
  expect((await canvas.screenshot()).equals(before)).toBe(true);

  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-backdrop', 'video');
  expect(await playing(page)).toBe(true);
});

test('its sound comes in on the first input, follows the sound effects volume and mute, and not the music', async ({
  page,
}) => {
  await openMenu(page, { backdrop: true });
  await expect.poll(() => playing(page)).toBe(true);
  expect((await audio(page)).muted).toBe(true);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect.poll(() => audio(page)).toEqual({ muted: false, volume: 0.8 });

  const sfx = page.getByRole('slider', { name: 'Sound effects volume' });
  await sfx.fill('40');
  await expect.poll(() => audio(page)).toEqual({ muted: false, volume: 0.4 });
  await page.getByRole('slider', { name: 'Music volume' }).fill('10');
  await expect.poll(() => audio(page)).toEqual({ muted: false, volume: 0.4 });
  await page.getByRole('slider', { name: 'Master volume' }).fill('0');
  await expect.poll(() => audio(page)).toMatchObject({ muted: true });
});

test('with reduced motion the menu shows the still, and the video plays hidden only once its sound can be heard', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page, { backdrop: true });
  await expect(root(page)).toHaveAttribute('data-backdrop', 'still');
  await expect(page.locator('#menu-backdrop img')).toBeVisible();
  await expect(video(page)).toHaveCSS('visibility', 'hidden');
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test('a game hides and pauses it; back on the menus it plays again', async ({ page }) => {
  await openMenu(page, { backdrop: true });
  await expect.poll(() => playing(page)).toBe(true);
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await page.getByRole('button', { name: `${FIRST_MAP.name}, no stars yet` }).click();
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await page.waitForFunction(() => window.__TD__ !== undefined);
  await expect(root(page)).not.toHaveAttribute('data-backdrop');
  await expect(page.locator('#menu-backdrop')).toBeHidden();
  expect(await video(page).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to menu' }).click();
  await expect(page.getByRole('heading', { name: 'Operations' })).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-backdrop', 'video');
  await expect.poll(() => playing(page)).toBe(true);
});

test('when the video fails to load the menu keeps its plain background', async ({ page }) => {
  await page.route(/menu-clip.*\.(webm|mp4)/, (route) => route.fulfill({ status: 404 }));
  await openMenu(page, { backdrop: true });
  await expect(root(page)).not.toHaveAttribute('data-backdrop');
  await expect(page.locator('#menu-backdrop')).toBeHidden();
  await expect(page.locator('#menu')).toHaveCSS('background-color', 'rgb(27, 30, 22)');
});

test('freezeBackdrop holds the video still at a fixed time, for screenshots that match every run', async ({ page }) => {
  await openMenu(page, { backdrop: true });
  await freezeBackdrop(page, 12);
  const at = () => video(page).evaluate((v: HTMLVideoElement) => ({ paused: v.paused, time: v.currentTime }));
  expect(await at()).toEqual({ paused: true, time: 12 });
  await page.waitForTimeout(300);
  expect(await at()).toEqual({ paused: true, time: 12 });
});

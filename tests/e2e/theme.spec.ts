import { expect, test, type Page } from '@playwright/test';
import { clickTile, openGame, openMenu, selectKind, state } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };

// From #399: the military look. Stencil titles, a monospace for readouts, self-hosted so itch builds work offline,
// with metric-matched fallbacks so nothing moves when the font files arrive.

type Box = { x: number; y: number; width: number; height: number };

/** The boxes of the elements a player aims at, by selector. */
async function boxes(page: Page, selectors: readonly string[]): Promise<Record<string, Box | null>> {
  const out: Record<string, Box | null> = {};
  for (const selector of selectors) out[selector] = await page.locator(selector).first().boundingBox();
  return out;
}

/** Whether the face has loaded and is the one the element draws with (its family list starts with it). */
const usesFace = (page: Page, selector: string, family: string) =>
  page.evaluate(
    ([selector, family]) => {
      const el = document.querySelector(selector)!;
      const style = getComputedStyle(el);
      const loaded = document.fonts.check(`${style.fontWeight} ${style.fontSize} '${family}'`);
      return loaded && style.fontFamily.startsWith(`"${family}"`);
    },
    [selector, family] as const,
  );

const MENU = ['#menu h1', '#menu button'];
const HUD = ['#hud', '[data-testid="hud-money"]', '[data-testid="start-wave"]', '[data-testid="pause"]', '#build-bar'];

test('titles use the stencil face and readouts the monospace, both self-hosted', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontRequests.push(request.url());
  });
  await openMenu(page);
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => usesFace(page, '#menu h1', 'Allerta Stencil')).toBe(true);
  await expect.poll(() => usesFace(page, '#menu button', 'IBM Plex Mono')).toBe(true);
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
});

for (const [name, open, selectors, mono] of [
  ['Main menu', openMenu, MENU, '#menu button'],
  ['HUD and build bar', openGame, HUD, '[data-testid="hud-money"]'],
] as const) {
  test(`the ${name} doesn't move when the fonts load`, async ({ page }) => {
    // First with the font files blocked: the metric-matched fallbacks draw everything.
    await page.route(/\.ttf$/, (route) => route.abort());
    await open(page);
    await page.evaluate(() => document.fonts.ready);
    const fallback = await boxes(page, selectors);
    await page.unrouteAll();

    await open(page);
    await expect.poll(() => usesFace(page, mono, 'IBM Plex Mono')).toBe(true);
    const loaded = await boxes(page, selectors);
    for (const selector of selectors) {
      const [a, b] = [fallback[selector]!, loaded[selector]!];
      expect(Math.abs(a.y - b.y), `${selector} top`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.height - b.height), `${selector} height`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.x - b.x), `${selector} left`).toBeLessThanOrEqual(1);
    }
  });
}

test('HUD text follows the root font size, so the text-size setting (#354) scales it', async ({ page }) => {
  await openGame(page);
  const size = () => page.getByTestId('hud-money').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const base = await size();
  await page.evaluate(() => (document.documentElement.style.fontSize = '125%'));
  expect(await size()).toBeCloseTo(base * 1.25, 1);
});

test('the tower panel names the selected tower by its unit designator, in capitals', async ({ page }) => {
  await openGame(page);
  await selectKind(page);
  await clickTile(page, BESIDE_PATH);
  await clickTile(page, BESIDE_PATH);
  const id = (await state(page)).towers[0]!.id;
  const heading = page.getByRole('dialog').locator('h2');
  await expect(heading).toHaveText(`1-${id} Rifle Nest`);
  expect(await heading.evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase');
  expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"Allerta Stencil"/);
});

test('on a phone, the HUD fits the width with the new faces', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openGame(page);
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const hud = document.getElementById('hud')!;
    return { page: document.documentElement.scrollWidth - window.innerWidth, hud: hud.scrollWidth - hud.clientWidth };
  });
  expect(overflow).toEqual({ page: 0, hud: 0 });
});

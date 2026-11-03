import type { Page } from '@playwright/test';
import { TILE_PX } from '../../src/data/display';
import type { TowerKind } from '../../src/data/towers';
import type { Tile } from '../../src/sim/map';
import type { TestState, TestView } from '../../src/testing/api';

/** Test mode's URL flags, as in src/testing/flags.ts. `test=1` is always on. */
export interface OpenOptions {
  readonly manualStep?: boolean;
  readonly anim?: boolean;
  readonly speed?: number;
  /** Saves settings to `localStorage` (`persist=1`); test mode keeps them in memory otherwise. */
  readonly persist?: boolean;
}

/** Opens the game in test mode and waits until `window.__TD__` is ready. */
export async function openGame(
  page: Page,
  { manualStep = true, anim = false, speed, persist = false }: OpenOptions = {},
) {
  const params = new URLSearchParams({ test: '1' });
  if (manualStep) params.set('step', 'manual');
  if (!anim) params.set('anim', '0');
  if (speed !== undefined) params.set('speed', String(speed));
  if (persist) params.set('persist', '1');
  await page.goto(`/?${params}`);
  await page.waitForFunction(() => window.__TD__ !== undefined);
}

/** How the Main menu and Level select open: with saved progress, or every map unlocked. */
export interface MenuOptions {
  /** Saved before the page loads, as `localStorage`'s progress (`persist=1`), e.g. `{ mvp: { completed: true, bestStars: 2 } }`. */
  readonly progress?: Readonly<Record<string, { completed: boolean; bestStars: number }>>;
  /** `unlock=all`: every map can be picked. */
  readonly unlockAll?: boolean;
}

/** Opens the Main menu in test mode (`menu=1`). `window.__TD__` appears only once Play starts a game. */
export async function openMenu(page: Page, { progress, unlockAll = false }: MenuOptions = {}) {
  const params = new URLSearchParams({ test: '1', menu: '1', step: 'manual', anim: '0' });
  if (unlockAll) params.set('unlock', 'all');
  if (progress !== undefined) {
    params.set('persist', '1');
    await page.addInitScript(
      (maps) => localStorage.setItem('military-td.progress', JSON.stringify({ version: 1, progress: { maps } })),
      progress,
    );
  }
  await page.goto(`/?${params}`);
  await page.getByRole('button', { name: 'Play' }).waitFor();
}

/** Opens the Level select in test mode: the Main menu, then Play. */
export async function openLevelSelect(page: Page, options: MenuOptions = {}) {
  await openMenu(page, options);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('heading', { name: 'Select map' }).waitFor();
}

/** The page coordinates of `tile`'s center, through the camera's pan and zoom, so a test clicks the canvas like a player. */
export async function tileToScreen(page: Page, { col, row }: Tile): Promise<{ x: number; y: number }> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('The game canvas is not on the page');
  const { scrollX, scrollY, zoom } = (await view(page)).camera;
  return {
    x: box.x + ((col + 0.5) * TILE_PX - scrollX) * zoom,
    y: box.y + ((row + 0.5) * TILE_PX - scrollY) * zoom,
  };
}

/** Selects `kind` on the build bar, unless it is selected already: no kind is at the start. */
export async function selectKind(page: Page, kind: TowerKind = 'rifleNest'): Promise<void> {
  const button = page.getByTestId(`build-${kind}`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
}

export async function clickTile(page: Page, tile: Tile): Promise<void> {
  const { x, y } = await tileToScreen(page, tile);
  await page.mouse.click(x, y);
}

export const state = (page: Page): Promise<TestState> => page.evaluate(() => window.__TD__!.state());

/** What the Game scene draws now. It changes on the next frame, so poll it (`expect.poll`) after moving the mouse. */
export const view = (page: Page): Promise<TestView> => page.evaluate(() => window.__TD__!.view());

/** Runs fixed ticks in chunks until the game ends, so a test reaches Victory or Defeat without waiting in real time. */
export async function stepToEnd(page: Page, maxTicks = 60 * 60 * 10): Promise<TestState> {
  for (let ticks = 0; ticks < maxTicks; ticks += 600) {
    const now = await page.evaluate(() => window.__TD__!.step(600));
    if (now.phase === 'victory' || now.phase === 'defeat') return now;
  }
  throw new Error(`The game did not end within ${maxTicks} ticks`);
}

/** Like `stepToEnd`, but starts each wave as soon as the game is back in the Build phase, as a player would. */
export async function playToEnd(page: Page, maxTicks = 60 * 60 * 30): Promise<TestState> {
  for (let ticks = 0; ticks < maxTicks; ticks += 600) {
    const now = await page.evaluate(() => {
      const td = window.__TD__!;
      if (td.state().phase === 'build') td.command({ type: 'startWave' });
      return td.step(600);
    });
    if (now.phase === 'victory' || now.phase === 'defeat') return now;
  }
  throw new Error(`The game did not end within ${maxTicks} ticks`);
}

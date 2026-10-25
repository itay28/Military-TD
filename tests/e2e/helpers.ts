import type { Page } from '@playwright/test';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE_PX } from '../../src/data/display';
import type { Tile } from '../../src/sim/map';
import type { TestState } from '../../src/testing/api';

/** Test mode's URL flags, as in src/testing/flags.ts. `test=1` is always on. */
export interface OpenOptions {
  readonly manualStep?: boolean;
  readonly anim?: boolean;
  readonly speed?: number;
}

/** Opens the game in test mode and waits until `window.__TD__` is ready. */
export async function openGame(page: Page, { manualStep = true, anim = false, speed }: OpenOptions = {}) {
  const params = new URLSearchParams({ test: '1' });
  if (manualStep) params.set('step', 'manual');
  if (!anim) params.set('anim', '0');
  if (speed !== undefined) params.set('speed', String(speed));
  await page.goto(`/?${params}`);
  await page.waitForFunction(() => window.__TD__ !== undefined);
}

/** The page coordinates of `tile`'s center, so a test clicks the canvas like a player. */
export async function tileToScreen(page: Page, { col, row }: Tile): Promise<{ x: number; y: number }> {
  const box = await page.locator('#game canvas').boundingBox();
  if (!box) throw new Error('The game canvas is not on the page');
  // Scaled, in case the canvas is ever drawn at another size than its resolution.
  return {
    x: box.x + ((col + 0.5) * TILE_PX * box.width) / CANVAS_WIDTH,
    y: box.y + ((row + 0.5) * TILE_PX * box.height) / CANVAS_HEIGHT,
  };
}

export async function clickTile(page: Page, tile: Tile): Promise<void> {
  const { x, y } = await tileToScreen(page, tile);
  await page.mouse.click(x, y);
}

export const state = (page: Page): Promise<TestState> => page.evaluate(() => window.__TD__!.state());

/** Runs fixed ticks in chunks until the game ends, so a test reaches Victory or Defeat without waiting in real time. */
export async function stepToEnd(page: Page, maxTicks = 60 * 60 * 10): Promise<TestState> {
  for (let ticks = 0; ticks < maxTicks; ticks += 600) {
    const now = await page.evaluate(() => window.__TD__!.step(600));
    if (now.phase === 'victory' || now.phase === 'defeat') return now;
  }
  throw new Error(`The game did not end within ${maxTicks} ticks`);
}

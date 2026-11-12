import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import gifenc from 'gifenc';
import { PNG } from 'pngjs';
import { TERMS } from '../../src/data/display';
import { importTiledMap } from '../../src/sim/tiled';
import type { GameState } from '../../src/sim/game';
import type { TestState } from '../../src/testing/api';
import { BALANCED_ORDER } from '../scenarios/bot-balanced.scenario';
import { buildOrder, fitOrder } from '../scenarios/bots';
import { COVER, GIF, JPEG_QUALITY, KIT_DIR, KIT_MAPS, SHOT_SIZES } from './shots';

// The itch.io page kit's images (#374), as a player sees the game: animation on and the live battlefield behind the
// menu. Test mode only drives it: `unlock=all` opens every map, `step=manual` lets the balance bot (the one the map
// tests use) build and call waves between ticks, so each shot lands mid-wave the same way every run.

// gifenc is CommonJS: Node gives its exports as the default.
const { GIFEncoder, applyPalette, quantize } = gifenc;

const MAP_FILES: Record<string, string> = {
  mvp: 'maps/01-training-ground.tmj',
  switchback: 'maps/02-switchback.tmj',
  serpentine: 'maps/03-serpentine.tmj',
  hairpin: 'maps/04-hairpin.tmj',
};

/** The wave each map's shot shows: late enough for a full defence, with a mix of enemies on the Path. */
const SHOT_WAVE = 8;
/** Ticks into that wave before the shot, so its groups have spread along the Path. */
const INTO_WAVE_TICKS = 60 * 7;
/** Ticks per bot turn while fast-forwarding; one second of game time. */
const BOT_TICKS = 60;
/** The GIF: frames, and the game ticks and real time between two (12 fps of game time at 1×). */
const GIF_FRAMES = 60;
const GIF_TICKS_PER_FRAME = 5;
const GIF_DELAY_MS = 83;

mkdirSync(KIT_DIR, { recursive: true });
const out = (file: string) => `${KIT_DIR}/${file}`;

/** Opens the Main menu as a player sees it. `manual`: the Game the menu starts runs only on `__TD__.step`. */
async function openMenu(page: Page, manual: boolean) {
  const params = new URLSearchParams({ test: '1', menu: '1', unlock: 'all', demo: '1' });
  if (manual) params.set('step', 'manual');
  await page.goto(`/?${params}`);
  await page.getByRole('button', { name: 'Deploy', exact: true }).waitFor();
}

async function openLevelSelect(page: Page, manual: boolean) {
  await openMenu(page, manual);
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await page.getByRole('heading', { name: 'Operations' }).waitFor();
}

/** Level select → the map's card → Deploy, then hints off, so nothing covers the battle. */
async function startMap(page: Page, name: string) {
  await openLevelSelect(page, true);
  await page.getByRole('button', { name: `${name}, no stars yet`, exact: true }).click();
  await page.getByRole('button', { name: 'Deploy', exact: true }).click();
  await page.waitForFunction(() => window.__TD__ !== undefined);
  await page.evaluate(() => window.__TD__!.setHints(false));
}

/** One bot turn: its commands, the next wave once the Build phase is back, then `ticks` ticks. */
async function botTurn(page: Page, mapId: string, ticks: number): Promise<TestState> {
  const data = importTiledMap(mapId, JSON.parse(readFileSync(MAP_FILES[mapId]!, 'utf8')));
  const bot = buildOrder(fitOrder(data, BALANCED_ORDER));
  const now = await page.evaluate(() => window.__TD__!.state());
  // The bot reads only towers and Money, which the test state has.
  const commands = bot(now as unknown as GameState);
  return page.evaluate(
    ({ commands, ticks }) => {
      const td = window.__TD__!;
      for (const command of commands) td.command(command);
      if (td.state().phase === 'build') td.command({ type: 'callNextWave' });
      return td.step(ticks);
    },
    { commands, ticks },
  );
}

/** Plays until wave `wave` is under way with enemies spread along the Path. */
async function playToWave(page: Page, mapId: string, wave: number) {
  for (let turn = 0; turn < 2000; turn++) {
    const now = await botTurn(page, mapId, BOT_TICKS);
    if (now.waveNumber >= wave && now.phase === 'wave') {
      await botTurn(page, mapId, INTO_WAVE_TICKS);
      return;
    }
    if (now.phase === 'victory' || now.phase === 'defeat') throw new Error(`${mapId} ended before wave ${wave}`);
  }
  throw new Error(`${mapId} never reached wave ${wave}`);
}

/** A few ticks a frame for half a second, so tracers, flashes and turrets are live in the shot. */
async function settle(page: Page) {
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.__TD__!.step(2));
    await page.waitForTimeout(33);
  }
}

/** Halves a PNG screenshot (2×2 box filter) to RGBA pixels. */
function halve(png: Buffer): { data: Uint8Array; width: number; height: number } {
  const src = PNG.sync.read(png);
  const width = src.width >> 1;
  const height = src.height >> 1;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 4; c++) {
        const at = (dx: number, dy: number) => src.data[((2 * y + dy) * src.width + 2 * x + dx) * 4 + c]!;
        data[(y * width + x) * 4 + c] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) >> 2;
      }
  return { data, width, height };
}

test.describe.configure({ mode: 'serial' });

for (const { id, name } of KIT_MAPS)
  test(`${name} mid-wave`, async ({ page }) => {
    for (const { width, height } of SHOT_SIZES) {
      await page.setViewportSize({ width, height });
      await startMap(page, name);
      await playToWave(page, id, SHOT_WAVE);
      await settle(page);
      await page.screenshot({ path: out(`map-${id}-${width}x${height}.jpg`), quality: JPEG_QUALITY });
    }
  });

test('Level select', async ({ page }) => {
  for (const { width, height } of SHOT_SIZES) {
    await page.setViewportSize({ width, height });
    await openLevelSelect(page, false);
    // The live battlefield behind it gets a few seconds to fill the Path.
    await page.waitForTimeout(6000);
    await page.screenshot({ path: out(`level-select-${width}x${height}.jpg`), quality: JPEG_QUALITY });
  }
});

test('End screen: a Victory', async ({ page }) => {
  const { id, name } = KIT_MAPS[0];
  for (const { width, height } of SHOT_SIZES) {
    await page.setViewportSize({ width, height });
    await startMap(page, name);
    for (let turn = 0; ; turn++) {
      const now = await botTurn(page, id, BOT_TICKS * 5);
      if (now.phase === 'victory') break;
      if (now.phase === 'defeat' || turn > 1000) throw new Error('The balance bot did not win');
    }
    await page.getByRole('heading', { name: TERMS.victory }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: out(`end-screen-${width}x${height}.jpg`), quality: JPEG_QUALITY });
  }
});

test('GIF of a wave being fought', async ({ page }) => {
  // Switchback: its drawn tiles compress well; the aerial Training Ground makes a GIF over 7 MB.
  const { id, name } = KIT_MAPS[1];
  await page.setViewportSize({ width: GIF.width * 2, height: GIF.height * 2 });
  await startMap(page, name);
  await playToWave(page, id, SHOT_WAVE);
  const frames: Uint8Array[] = [];
  for (let i = 0; i < GIF_FRAMES; i++) {
    await page.evaluate((ticks) => window.__TD__!.step(ticks), GIF_TICKS_PER_FRAME);
    await page.waitForTimeout(GIF_DELAY_MS / 2);
    frames.push(halve(await page.screenshot()).data);
  }
  // One palette for every frame, from a sample of them, so colours don't flicker between frames.
  const sample = frames.filter((_, i) => i % 10 === 0);
  const joined = new Uint8Array(sample.reduce((n, f) => n + f.length, 0));
  sample.reduce((at, f) => (joined.set(f, at), at + f.length), 0);
  const palette = quantize(joined, 256);
  const gif = GIFEncoder();
  frames.forEach((frame, i) =>
    gif.writeFrame(applyPalette(frame, palette), GIF.width, GIF.height, {
      delay: GIF_DELAY_MS,
      ...(i === 0 ? { palette, repeat: 0 } : {}),
    }),
  );
  gif.finish();
  writeFileSync(out(GIF.file), gif.bytes());
});

test('Cover: the title over the live battlefield', async ({ page }) => {
  await page.setViewportSize({ width: COVER.width, height: COVER.height });
  await openMenu(page, false);
  // Only the title: the buttons and the version label are for players, not the store's thumbnail.
  await page.getByRole('button').evaluateAll((buttons) => buttons.forEach((b) => (b.style.visibility = 'hidden')));
  await page.locator('#version').evaluate((label) => (label.style.visibility = 'hidden'));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out(COVER.file) });
});

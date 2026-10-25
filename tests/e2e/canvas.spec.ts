import { expect, test, type Page } from '@playwright/test';
import { TILE_PX } from '../../src/data/display';
import type { Tile } from '../../src/sim/map';
import { clickTile, openGame, state, stepToEnd, tileToScreen, view } from './helpers';

// What the Game scene draws, read through __TD__.view() (#134). The view changes on the next frame, so the
// tests poll it after moving the mouse. Tracers are the exception: they fade on frame time, so they're read in the
// same evaluate as the step that fired them.

const BESIDE_PATH = { col: 1, row: 3 };
const EMPTY_TILE = { col: 5, row: 4 };
const centerOf = ({ col, row }: Tile) => ({ x: (col + 0.5) * TILE_PX, y: (row + 0.5) * TILE_PX });

async function hover(page: Page, tile: Tile): Promise<void> {
  const { x, y } = await tileToScreen(page, tile);
  await page.mouse.move(x, y);
}

const rangeRing = async (page: Page) => (await view(page)).rangeRing;

/** Steps one tick at a time until a tower fires, and returns what's drawn right then, before any frame ages it. */
const stepUntilTracer = (page: Page) =>
  page.evaluate(() => {
    const td = window.__TD__!;
    for (let tick = 0; tick < 60 * 60; tick++) {
      td.step(1);
      const now = td.view();
      if (now.tracers.length > 0) return { view: now, state: td.state() };
    }
    throw new Error('No tower fired within a minute of game time');
  });

test("hovering a placed tower shows its range ring around the tower's tile; leaving it hides the ring", async ({
  page,
}) => {
  await openGame(page);
  await clickTile(page, BESIDE_PATH); // the pointer stays on the new tower
  const [tower] = (await state(page)).towers;

  await expect
    .poll(() => rangeRing(page))
    .toEqual({ visible: true, towerId: tower!.id, center: centerOf(BESIDE_PATH) });

  await hover(page, EMPTY_TILE);
  await expect.poll(() => rangeRing(page)).toMatchObject({ visible: false, towerId: null });

  await hover(page, BESIDE_PATH);
  await expect.poll(() => rangeRing(page)).toMatchObject({ visible: true, towerId: tower!.id });
});

// From #12: the scene kept hoveredTowerId across restarts, and the new game's first tower reuses id 1, so its
// ring never showed.
test('after Restart, a tower placed on the same tile shows its range ring when hovered', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('single-infantry-leaks'));
  await clickTile(page, BESIDE_PATH);
  const [first] = (await state(page)).towers;
  await expect.poll(() => rangeRing(page)).toMatchObject({ visible: true, towerId: first!.id });

  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await stepToEnd(page);
  // From the keyboard, so the pointer never leaves the tile: the old game ends with that tower's ring hovered.
  await page.getByRole('button', { name: 'Restart' }).press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await state(page)).towers).toEqual([]);

  await clickTile(page, BESIDE_PATH);
  const [second] = (await state(page)).towers;
  expect(second!.id).toBe(first!.id); // the case that broke: same id, same tile
  await expect
    .poll(() => rangeRing(page))
    .toEqual({ visible: true, towerId: second!.id, center: centerOf(BESIDE_PATH) });
});

test("a tower's shot draws a tracer from the tower's tile center to its target, which then fades", async ({ page }) => {
  await openGame(page, { anim: true });
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));

  const fired = await stepUntilTracer(page);
  const [tower] = fired.state.towers;
  expect(fired.view.tracers).toHaveLength(1);
  const [tracer] = fired.view.tracers;
  expect(tracer!.from).toEqual(centerOf(tower!.tile));
  expect(tracer!.alpha).toBe(1);
  const length = Math.hypot(tracer!.to.x - tracer!.from.x, tracer!.to.y - tracer!.from.y);
  expect(length).toBeGreaterThan(0);
  expect(length).toBeLessThanOrEqual(tower!.range * TILE_PX);

  // Cosmetic only: tracers fade on frame time, even with the game paused.
  await expect.poll(async () => (await view(page)).tracers).toEqual([]);
});

test('with anim=0 a shot draws no tracer', async ({ page }) => {
  await openGame(page, { anim: false });
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  const tracersDrawn = await page.evaluate(() => {
    const td = window.__TD__!;
    let drawn = 0;
    while (td.state().phase === 'wave') {
      td.step(1);
      drawn += td.view().tracers.length;
    }
    return drawn;
  });
  expect(tracersDrawn).toBe(0);
  expect((await state(page)).phase).toBe('victory'); // the tower did fire
});

test('draw order, back to front: map, towers, enemies, tracers, range ring', async ({ page }) => {
  await openGame(page, { anim: true });
  await page.evaluate(() => window.__TD__!.loadScenario('one-tower-kills-one-infantry'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await hover(page, BESIDE_PATH);
  await stepUntilTracer(page);

  // Enemy views are made on the next frame, so wait for one.
  await expect.poll(async () => (await view(page)).drawOrder).toContain('enemies');
  const layers = ['map', 'towers', 'enemies', 'tracers', 'rangeRing'];
  const { drawOrder, rangeRing: ring } = await view(page);
  expect(drawOrder.filter((layer) => layers.includes(layer))).toEqual(layers);
  expect(ring.visible).toBe(true);
});

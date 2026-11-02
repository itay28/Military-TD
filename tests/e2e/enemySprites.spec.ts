import { expect, test, type Page } from '@playwright/test';
import type { TestView } from '../../src/testing/api';
import { openGame, view } from './helpers';

/** 10 s into the every-enemy-kind wave: the Tank heads south, Jeep and Helicopter east, Infantry north. */
const SPREAD_TICKS = 600;

async function startEveryKind(page: Page, ticks = SPREAD_TICKS) {
  await page.evaluate(() => window.__TD__!.loadScenario('every-enemy-kind'));
  await page.evaluate(() => window.__TD__!.command({ type: 'startWave' }));
  await page.evaluate((n) => window.__TD__!.step(n), ticks);
}

const enemiesDrawn = (page: Page, count: number) =>
  expect.poll(async () => (await view(page)).enemies.length).toBe(count);

const facingOf = (enemies: TestView['enemies'], kind: string) => enemies.find((e) => e.kind === kind)!.facing;

test('each enemy faces the way it travels, and turns at a corner', async ({ page }) => {
  await openGame(page);
  await startEveryKind(page);
  await enemiesDrawn(page, 4);
  const { enemies } = await view(page);
  expect(facingOf(enemies, 'tank')).toBeCloseTo(Math.PI / 2); // south
  expect(facingOf(enemies, 'jeep')).toBeCloseTo(0); // east
  expect(facingOf(enemies, 'helicopter')).toBeCloseTo(0);
  expect(facingOf(enemies, 'infantry')).toBeCloseTo(-Math.PI / 2); // north

  // The Tank reaches the bottom corner (Path distance 8) after about 13.3 s and turns east.
  await page.evaluate(() => window.__TD__!.step(300));
  await expect.poll(async () => facingOf((await view(page)).enemies, 'tank')).toBeCloseTo(0);
});

test('with ?anim=0 enemies hold their first animation frame', async ({ page }) => {
  await openGame(page); // anim off
  await startEveryKind(page);
  await enemiesDrawn(page, 4);
  await page.waitForTimeout(500);
  expect((await view(page)).enemies.map((e) => e.frame)).toEqual([0, 0, 0, 0]);
});

test('with animation on, the movement frames cycle on real time even with the sim stepped by hand', async ({
  page,
}) => {
  await openGame(page, { anim: true });
  await startEveryKind(page);
  await enemiesDrawn(page, 4);
  // Watch one enemy: the others start on other frames on purpose.
  const seen = new Set<number>();
  await expect
    .poll(async () => {
      seen.add((await view(page)).enemies.find((e) => e.kind === 'tank')!.frame);
      return seen.size;
    })
    .toBeGreaterThan(1);
});

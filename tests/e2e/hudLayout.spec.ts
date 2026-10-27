import { expect, test, type Page } from '@playwright/test';
import { TICK_MS } from '../../src/sim/game';
import { AUTO_START_DELAY_MS } from '../../src/data/waves';
import { clickTile, openGame, selectKind } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };
const DELAY_TICKS = Math.round(AUTO_START_DELAY_MS / TICK_MS);

type Box = { x: number; y: number; width: number; height: number };

/** The boxes of the HUD and of each of its buttons, by name. */
async function layout(page: Page): Promise<Record<string, Box | null>> {
  const boxes: Record<string, Box | null> = { hud: await page.locator('#hud').boundingBox() };
  for (const id of ['start-wave', 'auto-start', 'game-speed', 'pause'])
    boxes[id] = await page.getByTestId(id).boundingBox();
  return boxes;
}

// From #274: the HUD buttons kept moving as texts appeared and grew, so a tap landed on the wrong one.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 900, height: 560 },
]) {
  test(`on ${viewport.width} × ${viewport.height}, the HUD and its buttons keep their place in every state`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    const initial = await layout(page);
    const states: string[] = [];
    const check = async (name: string) => {
      expect(await layout(page), name).toEqual(initial);
      states.push(name);
    };
    const step = (ticks: number) => page.evaluate((n) => window.__TD__!.step(n), ticks);

    await page.getByTestId('auto-start').click();
    await check('Auto-start on');
    await page.getByTestId('auto-start').click();
    await check('Auto-start off');
    await selectKind(page);
    await clickTile(page, BESIDE_PATH);
    await check('a tower bought');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('game-speed').click();
      await check(`game speed ${i + 1}`);
    }
    await page.getByTestId('auto-start').click();
    await page.getByTestId('start-wave').click();
    await check('wave started');
    await step(60);
    await check('mid-wave');
    await page.evaluate(() => {
      const td = window.__TD__!;
      while (td.state().phase === 'wave') td.step(1);
    });
    await expect(page.getByTestId('wave-banner')).toHaveText(/cleared/);
    await check('wave cleared (banner up)');
    await page.evaluate(() => window.__TD__!.step(1));
    await step(DELAY_TICKS - 100);
    await expect(page.getByTestId('hud-next-wave')).toHaveText(/Next wave in/);
    await check('countdown showing');
    await step(200);
    await expect(page.getByTestId('hud-wave')).toHaveText(/^Wave 2 \//);
    await check('the next wave auto-started');
    expect(states).toHaveLength(11);
  });
}

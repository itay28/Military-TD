import { expect, test, type Page } from '@playwright/test';
import { clickTile, openGame, selectKind } from './helpers';

const BESIDE_PATH = { col: 1, row: 3 };
const SECOND_BESIDE_PATH = { col: 2, row: 3 };

type Box = { x: number; y: number; width: number; height: number };

/** The boxes of the HUD and of each of its buttons, by name. */
async function layout(page: Page): Promise<Record<string, Box | null>> {
  const boxes: Record<string, Box | null> = { hud: await page.locator('#hud').boundingBox() };
  for (const id of ['start-wave', 'game-speed', 'pause']) boxes[id] = await page.getByTestId(id).boundingBox();
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

    await expect(page.getByTestId('hud-next-wave')).toHaveText(/^Next \d+s$/);
    await check('build window countdown');
    await selectKind(page);
    await clickTile(page, BESIDE_PATH);
    await check('a tower bought');
    await clickTile(page, SECOND_BESIDE_PATH);
    await check('two towers bought (Money 100 → 50 → 0)');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId(`game-speed-${i + 1}`).click();
      await check(`game speed ${i + 1}`);
    }
    await page.getByTestId('start-wave').click();
    await check('wave called in');
    await step(60);
    await check('mid-wave');
    await page.evaluate(() => {
      const td = window.__TD__!;
      while (td.state().phase === 'wave') td.step(1);
    });
    await expect(page.getByTestId('wave-banner')).toHaveText(/cleared/);
    await check('wave cleared (banner up)');
    await expect(page.getByTestId('hud-next-wave')).toHaveText(/^Next \d+s$/);
    await check('countdown showing');
    // Two calls in a row put waves 2 and 3 on the field together.
    await page.getByTestId('start-wave').click();
    await page.getByTestId('start-wave').click();
    await expect(page.getByTestId('hud-wave')).toHaveText(/^Waves 2–3 \//);
    await check('two waves overlapping');
    expect(states).toHaveLength(11);
  });
}

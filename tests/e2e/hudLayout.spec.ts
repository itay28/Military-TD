import { expect, test, type Page } from '@playwright/test';
import { clickTile, openGame, selectKind } from './helpers';

const BUTTONS = ['start-wave', 'auto-start', 'game-speed', 'pause'] as const;

type Box = { x: number; y: number; width: number; height: number };

/** Where each HUD button is, and the HUD's own box, rounded to whole pixels. */
async function layout(page: Page): Promise<Record<string, Box>> {
  // Wait a frame so the HUD has redrawn from the last step.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const out: Record<string, Box> = {};
  for (const id of ['hud', ...BUTTONS]) {
    const box = (await (id === 'hud' ? page.locator('#hud') : page.getByTestId(id)).boundingBox())!;
    out[id] = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  }
  return out;
}

/** Steps one tick at a time until the wave is cleared, so the "Wave N cleared" banner is still up. */
async function stepToClear(page: Page) {
  await page.evaluate(() => {
    const td = window.__TD__!;
    while (td.state().phase === 'wave') td.step(1);
  });
}

// The HUD's buttons stay put while the texts beside them change: a phone user taps where the button was a moment ago.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 360, height: 740 },
  { width: 900, height: 560 },
]) {
  test(`on ${viewport.width} × ${viewport.height}, the HUD buttons and the HUD keep their place in every state`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    const initial = await layout(page);
    const states: [string, () => Promise<void>][] = [
      ['Auto-start on', () => page.getByTestId('auto-start').click()],
      ['Auto-start off', () => page.getByTestId('auto-start').click()],
      [
        'a tower bought',
        async () => {
          await selectKind(page);
          await clickTile(page, { col: 1, row: 3 });
        },
      ],
      ['speed ×2', () => page.getByTestId('game-speed').click()],
      ['speed ×4', () => page.getByTestId('game-speed').click()],
      ['speed ×1', () => page.getByTestId('game-speed').click()],
      ['wave started', () => page.getByTestId('start-wave').click()],
      [
        'mid-wave',
        async () => {
          await page.evaluate(() => window.__TD__!.step(600));
        },
      ],
      ['wave cleared, banner up', () => stepToClear(page)],
      [
        'Auto-start on, banner up',
        async () => {
          await page.getByTestId('auto-start').click();
        },
      ],
      [
        'countdown showing',
        async () => {
          await page.evaluate(() => window.__TD__!.step(130));
          await expect(page.getByTestId('hud-next-wave')).toHaveText(/^Next wave in \d$/);
        },
      ],
      [
        'next wave started by itself',
        async () => {
          await page.evaluate(() => {
            const td = window.__TD__!;
            while (td.state().phase === 'build') td.step(1);
          });
        },
      ],
    ];
    for (const [name, act] of states) {
      await act();
      expect(await layout(page), `after: ${name}`).toEqual(initial);
      // The message slot clips a text too long for it; the banner and the countdown must fit whole.
      const clipped = await page.locator('#hud .hud-message').evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped, `message clipped after: ${name}`).toBe(false);
    }
  });
}

import { expect, test, type Page } from '@playwright/test';
import { TOWER_STATS, type TowerKind } from '../../src/data/towers';
import { towerLevels } from '../../src/sim/towers';
import { openGame, state, tileToScreen } from './helpers';

const VIEWPORTS = [
  { name: 'desktop', width: 900, height: 560 },
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
] as const;
const KINDS = Object.keys(TOWER_STATS) as TowerKind[];

/** Selects tower `kind` (placed by the every-tower-kind scenario) at `level`, by commands and a click on its tile. */
async function openPanel(page: Page, kind: TowerKind, level: number) {
  await openGame(page);
  await page.evaluate(() => window.__TD__!.loadScenario('every-tower-kind'));
  const tower = (await state(page)).towers.find((t) => t.kind === kind)!;
  for (let l = 1; l < level; l++) {
    await page.evaluate((towerId) => window.__TD__!.command({ type: 'upgradeTower', towerId }), tower.id);
  }
  const { x, y } = await tileToScreen(page, tower.tile);
  await page.mouse.click(x, y);
  await expect(page.getByRole('dialog')).toBeVisible();
}

for (const { name, ...viewport } of VIEWPORTS) {
  test.describe(`on ${name} (${viewport.width} × ${viewport.height})`, () => {
    test.use({ viewport });
    for (const kind of KINDS) {
      for (const level of [1, towerLevels(kind).length]) {
        test(`the ${kind} panel at level ${level} fits its box and the screen`, async ({ page }) => {
          await openPanel(page, kind, level);
          const overflowing = await page.evaluate(() => {
            const root = document.getElementById('tower-panel')!;
            return [root, ...root.querySelectorAll<HTMLElement>('*')]
              .filter((el) => el.scrollWidth > el.clientWidth)
              .map((el) => `${el.tagName} ${el.textContent}`);
          });
          expect(overflowing).toEqual([]);
          const box = (await page.locator('#tower-panel').boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
        });
      }
    }
  });
}

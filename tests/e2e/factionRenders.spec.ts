import { expect, test } from '@playwright/test';
import { FIRST_MAP, FOURTH_MAP, SECOND_MAP, THIRD_MAP } from './firstMap';
import { openLevelSelect, state, view } from './helpers';

// #567: every map draws its two Faction sets (ADR-0009 point 5): the defender's towers, the attacker's enemies, no Kenney.
const TOWERS = ['rifleNest', 'aaGun', 'cannon', 'mortar'] as const;
const ENEMIES = ['infantry', 'jeep', 'tank', 'helicopter'] as const;

/** The scenario with one of each tower beside `mapId`'s Path (`tests/scenarios/everyTowerKind.ts`). */
const everyTowerKind = (mapId: string) => (mapId === FIRST_MAP.id ? 'every-tower-kind' : `every-tower-kind-${mapId}`);

for (const map of [FIRST_MAP, SECOND_MAP, THIRD_MAP, FOURTH_MAP]) {
  test(`${map.name}: all 4 towers and all 4 enemy kinds are drawn from renders, with no texture errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (/texture|failed to process/i.test(message.text())) errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));

    await openLevelSelect(page, { unlockAll: true });
    await page.getByRole('button', { name: `${map.name}, no stars yet`, exact: true }).click();
    await page.getByRole('button', { name: 'Deploy', exact: true }).click();
    await page.waitForFunction(() => window.__TD__ !== undefined);
    await expect.poll(async () => (await state(page)).mapId).toBe(map.id);

    // Building all 4 takes more Money than a map starts with, so a scenario places them on this map.
    await page.evaluate((name) => window.__TD__!.loadScenario(name), everyTowerKind(map.id));
    expect((await state(page)).towers.map((t) => t.kind).sort()).toEqual([...TOWERS].sort());
    await page.evaluate((kinds) => {
      const td = window.__TD__!;
      for (const kind of kinds) td.command({ type: 'spawnEnemy', kind });
      td.step(30);
    }, ENEMIES);
    await expect.poll(async () => (await view(page)).rendered).toEqual([...TOWERS, ...ENEMIES].sort());
    expect(errors).toEqual([]);
  });
}

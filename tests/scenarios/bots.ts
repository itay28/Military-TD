import type { EnemyKind } from '../../src/data/enemies';
import type { TowerKind } from '../../src/data/towers';
import type { GameState } from '../../src/sim/game';
import { createMap, tileKey, type MapData, type Tile } from '../../src/sim/map';
import type { Scenario, ScenarioCommand, ScenarioResult } from '../../src/sim/scenario';
import { towerAt, towerLevels } from '../../src/sim/towers';
import type { WaveData } from '../../src/sim/waves';

// Scripted strategies for whole-game balance runs (#230). No Node imports: test mode bundles the scenario files.

/** One step of a build order: place a tower of `place` on `tile`, or bring the tower on `tile` up to `level`. */
export type BuildStep =
  { readonly place: TowerKind; readonly tile: Tile } | { readonly upgrade: Tile; readonly level: number };

/**
 * A bot that works through `steps` in order, like a player saving up: it takes the first step the state doesn't show
 * as done (a tower on the tile; the tower at the level) and gives its command once Money covers it, one per tick.
 * It reads everything from the state, so it has no memory of its own.
 */
export function buildOrder(steps: readonly BuildStep[]): NonNullable<Scenario['bot']> {
  return (state: GameState): ScenarioCommand[] => {
    for (const step of steps) {
      if ('place' in step) {
        if (towerAt(state.towers, step.tile)) continue;
        const cost = towerLevels(step.place)[0]!.cost;
        return state.money >= cost ? [{ type: 'placeTower', kind: step.place, tile: step.tile }] : [];
      }
      const tower = towerAt(state.towers, step.upgrade);
      if (!tower) return [];
      if (tower.level >= step.level) continue;
      const cost = towerLevels(tower.kind)[tower.level]!.cost;
      return state.money >= cost ? [{ type: 'upgradeTower', towerId: tower.id }] : [];
    }
    return [];
  };
}

/** Lives lost to leaks while one of `waves` (numbers from 1) was the latest started wave. */
export function livesLostDuring(result: ScenarioResult, waves: readonly number[]): number {
  let wave = 0;
  let lost = 0;
  for (const event of result.events) {
    if (event.type === 'waveStarted') wave = event.waveNumber;
    if (event.type === 'enemyLeaked' && waves.includes(wave)) lost += event.enemy.leakCost;
  }
  return lost;
}

/** The numbers (from 1) of the waves with at least one group of `kind`. */
export function wavesWith(waves: readonly WaveData[], kind: EnemyKind): number[] {
  return waves.flatMap((wave, i) => (wave.groups.some((group) => group.kind === kind) ? [i + 1] : []));
}

/**
 * `order` refitted to `map` (the reference bot, #58): each placement moves to the free buildable tile that covers the
 * most Path tiles for its kind, and the upgrades follow their tower. Lets one build order play any map.
 */
export function fitOrder(map: MapData, order: readonly BuildStep[]): BuildStep[] {
  const gameMap = createMap(map);
  const moved = new Map<string, Tile>();
  const taken = new Set<string>();
  return order.map((step) => {
    if (!('place' in step)) return { upgrade: moved.get(tileKey(step.upgrade)) ?? step.upgrade, level: step.level };
    const { range, minRange = 0 } = towerLevels(step.place)[0]!;
    const covered = (tile: Tile) =>
      gameMap.pathTiles.filter((path) => {
        const d = Math.hypot(path.col - tile.col, path.row - tile.row);
        return d <= range && d > minRange;
      }).length;
    let best: Tile | undefined;
    let bestCover = -1;
    for (let row = 0; row < map.rows; row++)
      for (let col = 0; col < map.cols; col++) {
        const tile = { col, row };
        if (!gameMap.isBuildable(tile) || taken.has(tileKey(tile))) continue;
        const cover = covered(tile);
        if (cover > bestCover) [best, bestCover] = [tile, cover];
      }
    if (!best) throw new Error(`Map "${map.id}" has no free buildable tile for ${step.place}`);
    taken.add(tileKey(best));
    moved.set(tileKey(step.tile), best);
    return { place: step.place, tile: best };
  });
}

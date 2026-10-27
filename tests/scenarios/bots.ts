import type { TowerKind } from '../../src/data/towers';
import type { GameState } from '../../src/sim/game';
import type { Tile } from '../../src/sim/map';
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
export function wavesWith(waves: readonly WaveData[], kind: string): number[] {
  return waves.flatMap((wave, i) => (wave.groups.some((group) => group.kind === kind) ? [i + 1] : []));
}

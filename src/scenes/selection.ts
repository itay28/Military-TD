import { ENEMY_STYLE } from '../data/display';
import type { TowerKind } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import type { Tile } from '../sim/map';
import { toPixels, type Pixel } from './coords';
import { towerAt, type Tower } from '../sim/towers';

/** What a left click on the map does. Selection is UI state, so this lives with the Scene, not the sim. */
export type ClickAction =
  | { readonly type: 'select'; readonly towerId: number }
  | { readonly type: 'inspect'; readonly enemyId: number }
  | { readonly type: 'deselect' }
  | { readonly type: 'place'; readonly kind: TowerKind; readonly tile: Tile }
  | { readonly type: 'none' };

/** What else is under the click: the enemy there (see `enemyAt`), and whether an enemy card is open. */
export interface ClickContext {
  readonly enemyId?: number | undefined;
  readonly cardOpen?: boolean;
}

/**
 * What a left click on `tile` does, given the selected tower's id and the build bar's selected kind. A click on a
 * tower selects it, and one on an enemy (`enemyId`) opens its card. Anywhere else, a selected tower or an open enemy
 * card is only closed, so a misclick doesn't spend Money; with neither, it places a tower of the selected kind, or does
 * nothing when no kind is selected.
 */
export function resolveClick(
  towers: readonly Tower[],
  selectedId: number | undefined,
  tile: Tile,
  buildKind: TowerKind | undefined,
  { enemyId, cardOpen = false }: ClickContext = {},
): ClickAction {
  const tower = towerAt(towers, tile);
  if (tower) return { type: 'select', towerId: tower.id };
  if (enemyId !== undefined) return { type: 'inspect', enemyId };
  if (selectedId !== undefined || cardOpen) return { type: 'deselect' };
  return buildKind ? { type: 'place', kind: buildKind, tile } : { type: 'none' };
}

/**
 * The enemy under world pixel `point`: the nearest one whose hit circle holds it. A hit circle is the enemy's drawn
 * radius, widened to `minRadius` world pixels so a small enemy stays easy to tap.
 */
export function enemyAt(enemies: readonly Enemy[], point: Pixel, minRadius: number): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDistance = Infinity;
  for (const enemy of enemies) {
    const at = toPixels(enemy.position);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    const radius = Math.max(ENEMY_STYLE[enemy.kind].radius, minRadius);
    if (distance <= radius && distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

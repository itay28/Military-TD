import type { TowerKind } from '../data/towers';
import type { Tile } from '../sim/map';
import { towerAt, type Tower } from '../sim/towers';

/** What a left click on the map does. Selection is UI state, so this lives with the Scene, not the sim. */
export type ClickAction =
  | { readonly type: 'select'; readonly towerId: number }
  | { readonly type: 'deselect' }
  | { readonly type: 'place'; readonly kind: TowerKind; readonly tile: Tile }
  | { readonly type: 'none' };

/**
 * What a left click on `tile` does, given the selected tower's id and the build bar's selected kind. A click on a
 * tower selects it. Anywhere else, a selection is only cleared, so a misclick doesn't spend Money; with none, it
 * places a tower of the selected kind, or does nothing when no kind is selected.
 */
export function resolveClick(
  towers: readonly Tower[],
  selectedId: number | undefined,
  tile: Tile,
  buildKind: TowerKind | undefined,
): ClickAction {
  const tower = towerAt(towers, tile);
  if (tower) return { type: 'select', towerId: tower.id };
  if (selectedId !== undefined) return { type: 'deselect' };
  return buildKind ? { type: 'place', kind: buildKind, tile } : { type: 'none' };
}

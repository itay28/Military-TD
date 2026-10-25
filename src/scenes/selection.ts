import type { Tile } from '../sim/map';
import { towerAt, type Tower } from '../sim/towers';

/** What a left click on the map does. Selection is UI state, so this lives with the Scene, not the sim. */
export type ClickAction =
  | { readonly type: 'select'; readonly towerId: number }
  | { readonly type: 'deselect' }
  | { readonly type: 'place'; readonly tile: Tile };

/**
 * What a left click on `tile` does, given the selected tower's id. A click on a tower selects it.
 * Anywhere else, a selection is only cleared, so a misclick doesn't spend Money; with none, it places a tower.
 */
export function resolveClick(towers: readonly Tower[], selectedId: number | undefined, tile: Tile): ClickAction {
  const tower = towerAt(towers, tile);
  if (tower) return { type: 'select', towerId: tower.id };
  return selectedId === undefined ? { type: 'place', tile } : { type: 'deselect' };
}

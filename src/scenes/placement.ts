import { PLACEMENT_REFUSAL_TEXT } from '../data/display';
import type { TowerKind } from '../data/towers';
import type { Game } from '../sim/game';
import type { Tile } from '../sim/map';
import { towerAt } from '../sim/towers';

/** The tower preview under the pointer. */
export interface Ghost {
  readonly tile: Tile;
  /** Whether a click here would place the tower now. */
  readonly placeable: boolean;
}

/**
 * The ghost to show for `tile`, the tile under the pointer. None off the map, or over a standing tower,
 * which shows its own range ring instead.
 */
export function ghostAt(game: Game, kind: TowerKind, tile: Tile | undefined): Ghost | undefined {
  if (!tile || !game.state.map.inBounds(tile) || towerAt(game.state.towers, tile)) return undefined;
  return { tile, placeable: game.canPlaceTower(kind, tile).ok };
}

/** Places a tower on `tile`. Returns nothing when it was placed, or the message saying why not. */
export function placeAt(game: Game, kind: TowerKind, tile: Tile): string | undefined {
  const result = game.placeTower(kind, tile);
  return result.ok ? undefined : PLACEMENT_REFUSAL_TEXT[result.reason];
}

/** A win's rating: 3★ no Lives lost, 2★ at least half the start Lives left, 1★ any other win. 0 for a Defeat. */
export type Stars = 0 | 1 | 2 | 3;

/** The part of saved progress unlocks read: which maps, by id, have been completed. */
export interface CompletedMaps {
  readonly maps: Readonly<Record<string, { readonly completed: boolean }>>;
}

/** The Stars a game ending with `livesLeft` of `startLives` earns. 0 Lives left is a Defeat. */
export function starsFor(livesLeft: number, startLives: number): Stars {
  if (livesLeft <= 0) return 0;
  if (livesLeft >= startLives) return 3;
  return livesLeft * 2 >= startLives ? 2 : 1;
}

/**
 * Whether the map at `mapIndex` (0-based, in `mapIds` order) is unlocked: the first always is, each later one once
 * the map before it is completed, with any stars. No index outside the list is.
 */
export function isUnlocked(mapIndex: number, mapIds: readonly string[], progress: CompletedMaps): boolean {
  if (!Number.isInteger(mapIndex) || mapIndex < 0 || mapIndex >= mapIds.length) return false;
  if (mapIndex === 0) return true;
  return progress.maps[mapIds[mapIndex - 1]!]?.completed === true;
}

/**
 * Whether a win of the map at `mapIndex` unlocks the map after it, given `progress` from before the win: true when
 * there is a next map and it is still locked.
 */
export function unlocksNext(mapIndex: number, mapIds: readonly string[], progress: CompletedMaps): boolean {
  return mapIndex >= 0 && mapIndex + 1 < mapIds.length && !isUnlocked(mapIndex + 1, mapIds, progress);
}

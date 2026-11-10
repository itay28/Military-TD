import type { EnemyKind } from '../data/enemies';
import type { Stars } from '../sim/progression';

export type { Stars };

export type WinStars = 1 | 2 | 3;

export interface MapProgress {
  readonly completed: boolean;
  /** The best result so far: 1★ any win, 2★ at least half the start Lives left, 3★ no Lives lost. 0 when only the score is unknown. */
  readonly bestStars: Stars;
}

/** What the player has finished, by map id, whether the first-map hints are over, and the enemy kinds met. */
export interface Progress {
  readonly maps: Readonly<Record<string, MapProgress>>;
  /** True once the onboarding hints were finished or skipped; Settings' Show hints again clears it. */
  readonly hintsDone: boolean;
  /** The enemy kinds met in a game, in the order first met: the Field manual shows only these (#408). */
  readonly metEnemies: readonly EnemyKind[];
}

export const EMPTY_PROGRESS: Progress = { maps: {}, hintsDone: false, metEnemies: [] };

export interface ProgressStore {
  get(): Progress;
  /** Records a win of `mapId` with `stars` (1 to 3). Only ever raises `bestStars`. Throws RangeError for other stars. */
  recordResult(mapId: string, stars: WinStars): void;
  /** Marks the onboarding hints done (finished or skipped), or with false shows them again. */
  setHintsDone(done: boolean): void;
  /** Records that the player has met an enemy of `kind`; once is enough. */
  recordMet(kind: EnemyKind): void;
}

export function createProgress(initial: Progress = EMPTY_PROGRESS): ProgressStore {
  let current = initial;
  return {
    get: () => current,
    recordResult(mapId, stars) {
      if (stars !== 1 && stars !== 2 && stars !== 3) throw new RangeError(`${stars} is not a result of 1 to 3 stars`);
      const best = Math.max(current.maps[mapId]?.bestStars ?? 0, stars) as Stars;
      current = { ...current, maps: { ...current.maps, [mapId]: { completed: true, bestStars: best } } };
    },
    setHintsDone(done) {
      current = { ...current, hintsDone: done };
    },
    recordMet(kind) {
      if (!current.metEnemies.includes(kind)) current = { ...current, metEnemies: [...current.metEnemies, kind] };
    },
  };
}

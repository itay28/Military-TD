export type Stars = 0 | 1 | 2 | 3;

export interface MapProgress {
  readonly completed: boolean;
  /** The best result so far: 1★ any win, 2★ at least half the start Lives left, 3★ no Lives lost. 0 when only the score is unknown. */
  readonly bestStars: Stars;
}

/** What the player has finished, by map id. */
export interface Progress {
  readonly maps: Readonly<Record<string, MapProgress>>;
}

export const EMPTY_PROGRESS: Progress = { maps: {} };

export interface ProgressStore {
  get(): Progress;
  /** Records a win of `mapId` with `stars` (1 to 3). Only ever raises `bestStars`. Throws RangeError for other stars. */
  recordResult(mapId: string, stars: Stars): void;
}

export function createProgress(initial: Progress = EMPTY_PROGRESS): ProgressStore {
  let current = initial;
  return {
    get: () => current,
    recordResult(mapId, stars) {
      if (stars !== 1 && stars !== 2 && stars !== 3) throw new RangeError(`${stars} is not a result of 1 to 3 stars`);
      const best = Math.max(current.maps[mapId]?.bestStars ?? 0, stars) as Stars;
      current = { maps: { ...current.maps, [mapId]: { completed: true, bestStars: best } } };
    },
  };
}

import type { EnemyKind } from '../data/enemies';

/** One wave: `count` enemies of one kind, spawned `spacingMs` apart. */
export interface WaveData {
  readonly kind: EnemyKind;
  readonly count: number;
  readonly spacingMs: number;
}

/** Throws RangeError for a wave whose count isn't a whole number ≥ 1 or whose spacing isn't a finite time ≥ 0. */
export function validateWaves(waves: readonly WaveData[]): void {
  waves.forEach(({ count, spacingMs }, i) => {
    if (!Number.isInteger(count) || count < 1)
      throw new RangeError(`wave ${i + 1}: count ${count} is not a whole number of at least 1`);
    if (!Number.isFinite(spacingMs) || spacingMs < 0)
      throw new RangeError(`wave ${i + 1}: spacing ${spacingMs} ms is not a finite, non-negative time`);
  });
}

/** When a wave's enemies spawn: spawn i is due i × spacingMs after the wave starts, the first at once. */
export interface SpawnSchedule {
  /** The spawn times (ms since the wave started) due by `elapsedMs` and not taken yet, in order. */
  take(elapsedMs: number): number[];
  /** Every spawn has been taken. */
  readonly finished: boolean;
}

/** Slack for float sums of tick times, so a spawn due on a tick happens on it. */
const TIME_EPSILON_MS = 1e-6;

export function createSpawnSchedule(wave: WaveData): SpawnSchedule {
  let taken = 0;
  return {
    get finished() {
      return taken === wave.count;
    },
    take(elapsedMs) {
      const due: number[] = [];
      while (taken < wave.count && taken * wave.spacingMs <= elapsedMs + TIME_EPSILON_MS)
        due.push(taken++ * wave.spacingMs);
      return due;
    },
  };
}

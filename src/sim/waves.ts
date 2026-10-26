import type { EnemyKind } from '../data/enemies';

/** One group in a wave: `count` enemies of one kind, the first `delayMs` after the wave starts, then `spacingMs` apart. */
export interface WaveGroup {
  readonly kind: EnemyKind;
  readonly count: number;
  readonly spacingMs: number;
  readonly delayMs: number;
}

/** One wave: its groups spawn on their own timelines, in parallel. */
export interface WaveData {
  readonly groups: readonly WaveGroup[];
}

/**
 * Throws RangeError, naming the wave and group, for a wave with no groups, or a group whose count isn't a whole
 * number ≥ 1 or whose spacing or delay isn't a finite time ≥ 0.
 */
export function validateWaves(waves: readonly WaveData[]): void {
  waves.forEach(({ groups }, w) => {
    if (groups.length === 0) throw new RangeError(`wave ${w + 1}: has no groups`);
    groups.forEach(({ count, spacingMs, delayMs }, g) => {
      const where = `wave ${w + 1}, group ${g + 1}`;
      if (!Number.isInteger(count) || count < 1)
        throw new RangeError(`${where}: count ${count} is not a whole number of at least 1`);
      if (!isTime(spacingMs))
        throw new RangeError(`${where}: spacing ${spacingMs} ms is not a finite, non-negative time`);
      if (!isTime(delayMs)) throw new RangeError(`${where}: delay ${delayMs} ms is not a finite, non-negative time`);
    });
  });
}

const isTime = (ms: number) => Number.isFinite(ms) && ms >= 0;

/** One enemy due to spawn: its kind, when (ms since the wave started), and its group's index in the wave. */
export interface Spawn {
  readonly kind: EnemyKind;
  readonly atMs: number;
  readonly group: number;
}

/** When a wave's enemies spawn: spawn i of a group is due delayMs + i × spacingMs after the wave starts. */
export interface SpawnSchedule {
  /** The spawns due by `elapsedMs` and not taken yet, in time order, ties in group order. */
  take(elapsedMs: number): Spawn[];
  /** Every group has spawned all of its enemies. */
  readonly finished: boolean;
}

/** Slack for float sums of tick times, so a spawn due on a tick happens on it. */
const TIME_EPSILON_MS = 1e-6;

export function createSpawnSchedule(wave: WaveData): SpawnSchedule {
  const taken = wave.groups.map(() => 0);
  return {
    get finished() {
      return wave.groups.every((group, g) => taken[g] === group.count);
    },
    take(elapsedMs) {
      const due: Spawn[] = [];
      wave.groups.forEach(({ kind, count, spacingMs, delayMs }, g) => {
        let n = taken[g]!;
        while (n < count && delayMs + n * spacingMs <= elapsedMs + TIME_EPSILON_MS)
          due.push({ kind, atMs: delayMs + n++ * spacingMs, group: g });
        taken[g] = n;
      });
      // Stable sort: equal times keep group order.
      return due.sort((a, b) => a.atMs - b.atMs);
    },
  };
}

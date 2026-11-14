import type { EnemyKind } from '../data/enemies';
import { towerLevels, type Tower } from './towers';
import type { WaveData } from './waves';

/** How many enemies of one kind a wave brings. */
export interface KindCount {
  readonly kind: EnemyKind;
  readonly count: number;
}

/** What Sniper intel reports on one coming wave (#353). */
export interface WaveIntel {
  /** Counting from 1, as the HUD numbers waves. */
  readonly waveNumber: number;
  readonly composition: readonly KindCount[];
}

/** The parts of a tower that decide the intel it gives. */
export type IntelTower = Pick<Tower, 'kind' | 'level' | 'dismantleMs'>;

/**
 * A wave's composition: each enemy kind once, with its groups' counts summed, in order of first appearance (the
 * earliest first spawn of its groups; kinds that first spawn at the same time keep group order).
 */
export function waveComposition(wave: WaveData): KindCount[] {
  const kinds = new Map<EnemyKind, { firstMs: number; count: number }>();
  for (const { kind, count, delayMs } of wave.groups) {
    const seen = kinds.get(kind);
    if (seen) {
      seen.count += count;
      seen.firstMs = Math.min(seen.firstMs, delayMs);
    } else kinds.set(kind, { firstMs: delayMs, count });
  }
  // Stable sort: equal first spawns keep the order the kinds were first met, which is group order.
  return [...kinds].sort(([, a], [, b]) => a.firstMs - b.firstMs).map(([kind, { count }]) => ({ kind, count }));
}

/**
 * How many coming waves the player's Snipers report (#353): 0 without a standing Sniper (one being dismantled doesn't
 * count), 1 with one, 2 when one is at level 3 (its top level), which adds the wave after next.
 */
export function intelDepth(towers: readonly IntelTower[]): 0 | 1 | 2 {
  const snipers = towers.filter((t) => t.kind === 'sniper' && t.dismantleMs === undefined);
  if (snipers.length === 0) return 0;
  const top = towerLevels('sniper').length;
  return snipers.some((t) => t.level >= top) ? 2 : 1;
}

/** The intel on the next `depth` waves from `waves[nextIndex]` (0-based), stopping at the end of the schedule. */
export function waveIntel(waves: readonly WaveData[], nextIndex: number, depth: number): WaveIntel[] {
  return waves
    .slice(nextIndex, nextIndex + depth)
    .map((wave, i) => ({ waveNumber: nextIndex + i + 1, composition: waveComposition(wave) }));
}

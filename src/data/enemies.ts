import type { EnemyStats } from '../sim/enemies';

/** Enemy stats by kind. Adding a kind here adds it to `EnemyKind`. */
export const ENEMY_STATS = {
  infantry: { maxHp: 30, speed: 1.5, reward: 4, leakCost: 1, armor: 0, layer: 'ground' },
  tank: { maxHp: 250, speed: 0.6, reward: 25, leakCost: 5, armor: 8, layer: 'ground' },
  jeep: { maxHp: 20, speed: 3, reward: 3, leakCost: 1, armor: 0, layer: 'ground' },
  helicopter: { maxHp: 130, speed: 1.2, reward: 10, leakCost: 2, armor: 4, layer: 'air' },
  heavyTank: { maxHp: 1500, speed: 0.4, reward: 120, leakCost: 10, armor: 12, layer: 'ground', boss: true },
  gunship: { maxHp: 1200, speed: 0.8, reward: 100, leakCost: 10, armor: 6, layer: 'air', boss: true },
} as const satisfies Record<string, EnemyStats>;

export type EnemyKind = keyof typeof ENEMY_STATS;

/** Kinds that aren't in any map's waves yet (ADR-0009). Tests and headless scenarios can still spawn them. */
export const NOT_IN_PLAY: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['heavyTank', 'gunship']);

/** The kinds that appear in play lists (waves, How to play, Field manual), in `ENEMY_STATS` order: every kind not in `NOT_IN_PLAY`. */
export const PLAYABLE_ENEMY_KINDS: readonly EnemyKind[] = (Object.keys(ENEMY_STATS) as EnemyKind[]).filter(
  (k) => !NOT_IN_PLAY.has(k),
);

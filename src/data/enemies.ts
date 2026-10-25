import type { EnemyStats } from '../sim/enemies';

/** Enemy stats by kind. Adding a kind here adds it to `EnemyKind`. */
export const ENEMY_STATS = {
  infantry: { maxHp: 30, speed: 1.5, reward: 5, leakCost: 1, armor: 0, layer: 'ground' },
} as const satisfies Record<string, EnemyStats>;

export type EnemyKind = keyof typeof ENEMY_STATS;

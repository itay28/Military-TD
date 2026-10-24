import type { TowerStats } from '../sim/towers';

/** Tower stats by kind. Adding a kind here adds it to `TowerKind`. */
export const TOWER_STATS = {
  rifleNest: { cost: 50, range: 2.5, fireRate: 2, damage: 10 },
} as const satisfies Record<string, TowerStats>;

export type TowerKind = keyof typeof TOWER_STATS;

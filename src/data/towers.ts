import type { TowerStats } from '../sim/towers';

/** Tower stats by kind. Adding a kind here adds it to `TowerKind`. */
export const TOWER_STATS = {
  rifleNest: { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
  aaGun: { cost: 75, range: 3, fireRate: 4, damage: 8, targets: ['air'] },
} as const satisfies Record<string, TowerStats>;

export type TowerKind = keyof typeof TOWER_STATS;

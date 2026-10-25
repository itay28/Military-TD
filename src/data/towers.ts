import type { TowerStats } from '../sim/towers';

/** Tower stats by kind, at level 1. Adding a kind here adds it to `TowerKind`. */
export const TOWER_STATS = {
  rifleNest: { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
} as const satisfies Record<string, TowerStats>;

export type TowerKind = keyof typeof TOWER_STATS;

/**
 * The full stats of each level above 1, by kind: level 2 first. `cost` is the Money to reach that level.
 * Starting pattern (balance in #16): level 2 (optics) costs 80% of the base and adds 0.5 range;
 * level 3 (heavier weapon) costs 140% of the base and adds 60% damage and 25% fire rate.
 */
export const TOWER_LEVELS = {
  rifleNest: [
    { cost: 40, range: 3, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
    { cost: 70, range: 3, fireRate: 2.5, damage: 16, targets: ['ground', 'air'] },
  ],
} as const satisfies Record<TowerKind, readonly TowerStats[]>;

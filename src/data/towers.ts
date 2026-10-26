import type { TowerStats } from '../sim/towers';

/** Tower stats by kind, at level 1. Adding a kind here adds it to `TowerKind`. */
export const TOWER_STATS = {
  rifleNest: { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
  aaGun: { cost: 75, range: 3, fireRate: 4, damage: 8, targets: ['air', 'ground'] },
  cannon: { cost: 100, range: 3, fireRate: 0.5, damage: 60, armorPierce: 5, targets: ['ground'] },
  mortar: {
    cost: 125,
    range: 5,
    minRange: 1.5,
    fireRate: 1 / 3,
    damage: 40,
    targets: ['ground'],
    shell: { flightMs: 1000, innerRadius: 0.6, outerRadius: 1.25 },
  },
} as const satisfies Record<string, TowerStats>;

export type TowerKind = keyof typeof TOWER_STATS;

/** How long selling a tower takes, in ms: it stops firing at once and the refund comes when this is up. */
export const DISMANTLE_MS = 2000;

/** The share of a tower's `spent` (placement plus upgrades) that selling it gives back, rounded down. */
export const SELL_REFUND = 0.7;

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
  aaGun: [
    { cost: 60, range: 3.5, fireRate: 4, damage: 8, targets: ['air', 'ground'] },
    { cost: 105, range: 3.5, fireRate: 5, damage: 12.8, targets: ['air', 'ground'] },
  ],
  cannon: [
    { cost: 80, range: 3.5, fireRate: 0.5, damage: 60, armorPierce: 5, targets: ['ground'] },
    { cost: 140, range: 3.5, fireRate: 0.625, damage: 96, armorPierce: 5, targets: ['ground'] },
  ],
  mortar: [
    { ...TOWER_STATS.mortar, cost: 100, range: 5.5 },
    { ...TOWER_STATS.mortar, cost: 175, range: 5.5, fireRate: 0.625 / 1.5, damage: 64 },
  ],
} as const satisfies Record<TowerKind, readonly TowerStats[]>;

import type { TowerStats } from '../sim/towers';

/** Tower stats by kind. Adding a kind here adds it to `TowerKind`. */
export const TOWER_STATS = {
  rifleNest: { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
  mortar: {
    cost: 125,
    range: 5,
    minRange: 1.5,
    fireRate: 1 / 3,
    damage: 40,
    targets: ['ground'],
    shell: { flightMs: 1000, innerRadius: 0.6, outerRadius: 1.25 },
  },
  cannon: { cost: 100, range: 3, fireRate: 0.5, damage: 60, armorPierce: 5, targets: ['ground'] },
} as const satisfies Record<string, TowerStats>;

export type TowerKind = keyof typeof TOWER_STATS;

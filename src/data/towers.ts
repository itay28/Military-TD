import type { TowerStats } from '../sim/towers';

/** Tower stats by kind, at level 1. Adding a kind here adds it to `TowerKind`. */
export const TOWER_STATS = {
  rifleNest: { cost: 50, range: 2.5, fireRate: 2, damage: 10, targets: ['ground', 'air'] },
  // Its light, fast-fused rounds are made for thin-skinned aircraft: they do less to a ground target (#588), so an
  // AA Gun alone doesn't hold the ground waves (ADR-0007).
  aaGun: { cost: 75, range: 3, fireRate: 3, damage: 13, groundDamage: 10, targets: ['air', 'ground'] },
  cannon: { cost: 100, range: 3, fireRate: 0.5, damage: 60, armorPierce: 8, targets: ['ground'] },
  mortar: {
    cost: 125,
    range: 5,
    minRange: 1.5,
    fireRate: 1 / 3,
    damage: 40,
    targets: ['ground'],
    shell: { flightMs: 1000, innerRadius: 0.6, outerRadius: 1.25 },
  },
  // Automatic grenade launcher (Mk 19, AGS-17/30, QLZ-87): fast bursts of small-blast grenades, direct fire, so no
  // dead zone. A grenade flies as a Shell; armor comes off each hit, so tanks barely notice (#75).
  grenadeLauncher: {
    cost: 90,
    range: 3,
    fireRate: 1.5,
    damage: 14,
    targets: ['ground'],
    shell: { flightMs: 400, innerRadius: 0.35, outerRadius: 0.7 },
  },
  sniper: {
    cost: 110,
    range: 6,
    fireRate: 0.4,
    damage: 70,
    armorPierce: 4,
    targets: ['ground'],
    targeting: 'strongest',
  },
} as const satisfies Record<string, TowerStats>;

export type TowerKind = keyof typeof TOWER_STATS;

/**
 * Kinds in the sim (tests and headless scenarios use them) but not in play yet: no build bar button. A kind joins
 * play in its rollout issue, once its renders land (ADR-0009: no map mixes art styles). The Sniper's is #364 (the
 * grenade launcher joined in #365).
 */
export const NOT_IN_PLAY: ReadonlySet<TowerKind> = new Set<TowerKind>(['sniper']);

/** The kinds the player can build, in `TOWER_STATS` order: every kind not in `NOT_IN_PLAY`. */
export const BUILD_KINDS: readonly TowerKind[] = (Object.keys(TOWER_STATS) as TowerKind[]).filter(
  (kind) => !NOT_IN_PLAY.has(kind),
);

/**
 * How fast each kind's turret turns toward its target, in radians per second; it fires only once it faces it
 * (within `AIM_TOLERANCE`). A soldier and a light AA mount swing fast, a heavy gun slowly; a sniper's long rifle in between.
 * `null`: the Mortar lobs shells (indirect fire), so it fires without turning. The grenade launcher fires shells too,
 * but aimed directly from a tripod, so it turns.
 */
export const TURN_RATES: Record<TowerKind, number | null> = {
  rifleNest: 8 * Math.PI,
  aaGun: 3 * Math.PI,
  cannon: Math.PI / 2,
  mortar: null,
  grenadeLauncher: 2 * Math.PI,
  sniper: Math.PI,
};

/** Seconds of look-ahead every turning kind gets, on top of the time a half turn takes it (see `trackHorizon`). */
export const TRACK_BASE_S = 1.5;

/**
 * How far ahead, in seconds, an idle tower looks for an enemy to pre-aim at: `TRACK_BASE_S` plus a half turn
 * (π / turn rate), so a slow turret looks further ahead. `null` for a kind with no turn rate (the Mortar).
 */
export function trackHorizon(kind: TowerKind): number | null {
  const turnRate = TURN_RATES[kind];
  return turnRate === null ? null : TRACK_BASE_S + Math.PI / turnRate;
}

/** A pre-aiming tower keeps the enemy it's laying on unless another would come into range this much sooner, in seconds. */
export const RETARGET_MARGIN_S = 0.25;

/** How far off its target, in radians, a turret may point and still fire (about 6°). */
export const AIM_TOLERANCE = 0.1;

/** The way a placed tower faces, in radians (0 east, rows grow down): north. */
export const START_HEADING = -Math.PI / 2;

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
    { cost: 60, range: 3.5, fireRate: 3, damage: 13, groundDamage: 10, targets: ['air', 'ground'] },
    { cost: 105, range: 3.5, fireRate: 3.75, damage: 20.8, groundDamage: 16, targets: ['air', 'ground'] },
  ],
  cannon: [
    { cost: 80, range: 3.5, fireRate: 0.5, damage: 60, armorPierce: 8, targets: ['ground'] },
    { cost: 140, range: 3.5, fireRate: 0.625, damage: 96, armorPierce: 8, targets: ['ground'] },
  ],
  mortar: [
    { ...TOWER_STATS.mortar, cost: 100, range: 5.5 },
    { ...TOWER_STATS.mortar, cost: 175, range: 5.5, fireRate: 0.625 / 1.5, damage: 64 },
  ],
  grenadeLauncher: [
    { ...TOWER_STATS.grenadeLauncher, cost: 72, range: 3.5 },
    { ...TOWER_STATS.grenadeLauncher, cost: 126, range: 3.5, fireRate: 1.875, damage: 22.4 },
  ],
  sniper: [
    { ...TOWER_STATS.sniper, cost: 88, range: 6.5 },
    { ...TOWER_STATS.sniper, cost: 154, range: 6.5, fireRate: 0.5, damage: 112 },
  ],
} as const satisfies Record<TowerKind, readonly TowerStats[]>;

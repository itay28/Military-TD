import { damageTaken } from '../sim/combat';
import { ENEMY_STATS, type EnemyKind } from './enemies';
import { TOWER_STATS, type TowerKind } from './towers';

// The counter matrix (#230, ADR-0007: no hard counters), shared by its test and the Field manual. A tower's efficiency
// against an enemy kind is the damage per second it deals a lone enemy of that kind, after armor and pierce, per
// Money of its cost. A hit counts for no more than the enemy's max HP; a shell counts its inner-ring damage; a tower
// that can't hit the enemy's layer scores 0.

const TOWER_KINDS = Object.keys(TOWER_STATS) as TowerKind[];
const ENEMY_KINDS = Object.keys(ENEMY_STATS) as EnemyKind[];

/** At or above this share of the best tower's efficiency against an enemy, a tower counts as an efficient counter. */
export const EFFICIENT_SHARE = 0.5;
/** Below a third of the best, a tower does poorly against that enemy (or can't hit it at all). */
export const POOR_SHARE = 1 / 3;

/** Damage per second per Money of `tower` at level 1 against a lone `enemy`. */
export function efficiency(tower: TowerKind, enemy: EnemyKind): number {
  const t: { cost: number; fireRate: number; damage: number; targets: readonly string[]; armorPierce?: number } =
    TOWER_STATS[tower];
  const e = ENEMY_STATS[enemy];
  if (!t.targets.includes(e.layer)) return 0;
  return (t.fireRate * damageTaken(t.damage, e.armor, t.armorPierce ?? 0, e.maxHp)) / t.cost;
}

/** `tower`'s efficiency against `enemy` as a share of the best tower's. */
const share = (tower: TowerKind, enemy: EnemyKind) =>
  efficiency(tower, enemy) / Math.max(...TOWER_KINDS.map((t) => efficiency(t, enemy)));

/** The towers that are an efficient counter to `enemy`. */
export const counteredBy = (enemy: EnemyKind): TowerKind[] =>
  TOWER_KINDS.filter((tower) => share(tower, enemy) >= EFFICIENT_SHARE);

/** The towers that do poorly against `enemy`. */
export const resists = (enemy: EnemyKind): TowerKind[] =>
  TOWER_KINDS.filter((tower) => share(tower, enemy) < POOR_SHARE);

/** The enemy kinds `tower` is an efficient counter to. */
export const strongAgainst = (tower: TowerKind): EnemyKind[] =>
  ENEMY_KINDS.filter((enemy) => share(tower, enemy) >= EFFICIENT_SHARE);

/** The enemy kinds `tower` does poorly against. */
export const poorAgainst = (tower: TowerKind): EnemyKind[] =>
  ENEMY_KINDS.filter((enemy) => share(tower, enemy) < POOR_SHARE);

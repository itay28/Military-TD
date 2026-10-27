import { describe, expect, it } from 'vitest';
import { damageTaken } from '../sim/combat';
import { ENEMY_STATS, type EnemyKind } from './enemies';
import { TOWER_STATS, type TowerKind } from './towers';

// The counter matrix (#230, ADR-0007: no hard counters). A tower's efficiency against an enemy kind is the damage per
// second it deals a lone enemy of that kind, after armor and pierce, per Money of its cost. A hit counts for no more
// than the enemy's max HP; a shell counts its inner-ring damage; a tower that can't hit the enemy's layer scores 0.

const towerKinds = Object.keys(TOWER_STATS) as TowerKind[];
const enemyKinds = Object.keys(ENEMY_STATS) as EnemyKind[];

/** Share of the best tower's efficiency a tower needs to count as an efficient counter. */
const EFFICIENT_SHARE = 0.5;
const MIN_COUNTERS = 2;

function efficiency(tower: TowerKind, enemy: EnemyKind): number {
  const t: { cost: number; fireRate: number; damage: number; targets: readonly string[]; armorPierce?: number } =
    TOWER_STATS[tower];
  const e = ENEMY_STATS[enemy];
  if (!t.targets.includes(e.layer)) return 0;
  return (t.fireRate * damageTaken(t.damage, e.armor, t.armorPierce ?? 0, e.maxHp)) / t.cost;
}

function efficientCounters(enemy: EnemyKind): TowerKind[] {
  const best = Math.max(...towerKinds.map((tower) => efficiency(tower, enemy)));
  return towerKinds.filter((tower) => efficiency(tower, enemy) >= EFFICIENT_SHARE * best);
}

describe('counter matrix', () => {
  it.each(enemyKinds)('%s has at least two efficient counters', (enemy) => {
    expect(efficientCounters(enemy).length).toBeGreaterThanOrEqual(MIN_COUNTERS);
  });

  it('scores a tower that cannot hit the layer 0, and counts armor, pierce and overkill', () => {
    expect(efficiency('cannon', 'helicopter')).toBe(0);
    // Rifle Nest vs Tank: 2 shots/s × (10 − 8 armor) / 50 Money.
    expect(efficiency('rifleNest', 'tank')).toBeCloseTo((2 * 2) / 50);
    // Cannon vs Tank: pierce cancels the armor.
    expect(efficiency('cannon', 'tank')).toBeCloseTo((0.5 * 60) / 100);
    // Cannon vs Jeep: a 60-damage shell kills a 20-HP Jeep, so it counts 20.
    expect(efficiency('cannon', 'jeep')).toBeCloseTo((0.5 * 20) / 100);
  });
});

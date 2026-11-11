import { describe, expect, it } from 'vitest';
import { EFFICIENT_SHARE, efficiency } from './counters';
import { ENEMY_STATS, type EnemyKind } from './enemies';
import { TOWER_STATS, type TowerKind } from './towers';

// The counter matrix (#230, ADR-0007: no hard counters). A tower's efficiency against an enemy kind is the damage per
// second it deals a lone enemy of that kind, after armor and pierce, per Money of its cost. A hit counts for no more
// than the enemy's max HP; a shell counts its inner-ring damage; a tower that can't hit the enemy's layer scores 0.

const towerKinds = Object.keys(TOWER_STATS) as TowerKind[];
const enemyKinds = Object.keys(ENEMY_STATS) as EnemyKind[];

const MIN_COUNTERS = 2;

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

  // The matrix scores a lone enemy, so it doesn't count the blast that makes the launcher good against groups.
  it('does not count the grenade launcher an efficient counter to the Tank: armor eats each grenade (#75)', () => {
    expect(efficientCounters('tank')).not.toContain('grenadeLauncher');
    // 1.5 grenades/s × (14 − 8 armor) / 90 Money: the Tank barely notices.
    expect(efficiency('grenadeLauncher', 'tank')).toBeCloseTo((1.5 * 6) / 90);
  });

  it('the Sniper chips Tanks (an efficient counter) but the Cannon stays the best against them', () => {
    expect(efficientCounters('tank')).toContain('sniper');
    const best = towerKinds.reduce((a, b) => (efficiency(b, 'tank') > efficiency(a, 'tank') ? b : a));
    expect(best).toBe('cannon');
  });
});

import type { TowerKind } from '../data/towers';
import { damageTaken, type Layer } from './combat';
import type { Enemy } from './enemies';
import { tileCenter, type Position, type Tile } from './map';

export interface TowerStats {
  /** Money to place it. */
  readonly cost: number;
  /** In tiles, from the tower's tile center. */
  readonly range: number;
  /** Shots per second. */
  readonly fireRate: number;
  /** HP taken per shot, before armor. */
  readonly damage: number;
  /** The layers it can hit. */
  readonly targets: readonly Layer[];
  /** Armor it ignores per hit; 0 when left out. */
  readonly armorPierce?: number;
  /** In tiles: a shot also hits every enemy it can target within this distance (inclusive) of the target; none when left out. */
  readonly splashRadius?: number;
}

/** A placed tower. Its stats are copied from its kind when it is placed. */
export interface Tower extends TowerStats {
  readonly id: number;
  readonly kind: TowerKind;
  readonly tile: Tile;
  /** Time until it can fire again; 0 when ready. */
  readonly cooldownMs: number;
}

/** What a shot did to one enemy. */
export interface Hit {
  readonly enemyId: number;
  /** HP actually removed: after armor, and no more than it had left. */
  readonly damage: number;
}

/** One shot: `towerId` fired at `targetId`. */
export interface Shot {
  readonly towerId: number;
  readonly targetId: number;
  /** Where the target was when hit, for the tracer's end even if the shot killed it. */
  readonly position: Position;
  /** Every enemy the shot damaged; one for a direct-fire tower. */
  readonly hits: readonly Hit[];
}

/** The tower standing on `tile`, if any. */
export function towerAt(towers: readonly Tower[], { col, row }: Tile): Tower | undefined {
  return towers.find((tower) => tower.tile.col === col && tower.tile.row === row);
}

/** Slack for float sums of tick times, so a shot due on a tick fires on it. */
const COOLDOWN_EPSILON = 1e-9;

/**
 * The enemy on a layer the tower hits and in range (inclusive, from the tile center) furthest along the Path ("first").
 * Ties go to the one earlier in `enemies`, i.e. spawned first.
 */
export function selectTarget(tower: Tower, enemies: readonly Enemy[]): Enemy | undefined {
  const center = tileCenter(tower.tile);
  let target: Enemy | undefined;
  for (const enemy of enemies) {
    if (!tower.targets.includes(enemy.layer)) continue;
    const inRange = Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y) <= tower.range;
    if (inRange && (!target || enemy.distance > target.distance)) target = enemy;
  }
  return target;
}

/**
 * Counts each tower's cooldown down by `dtMs`; a ready tower with a target hits it once,
 * for `damage` less the target's armor (see `damageTaken`);
 * with a `splashRadius`, it hits every enemy it can target near the target the same way.
 * Towers act in order, and an enemy at 0 HP is removed at once, so later towers retarget.
 * Time past the end of a cooldown carries into the next, so the fire rate holds at any tick size;
 * an idle tower waits at 0, ready.
 */
export function fireTowers(
  towers: readonly Tower[],
  enemies: readonly Enemy[],
  dtMs: number,
): { towers: Tower[]; enemies: Enemy[]; shots: Shot[]; kills: Enemy[] } {
  let alive = [...enemies];
  const shots: Shot[] = [];
  const kills: Enemy[] = [];
  const nextTowers = towers.map((tower) => {
    const cooldownMs = tower.cooldownMs - dtMs;
    const target = cooldownMs <= COOLDOWN_EPSILON ? selectTarget(tower, alive) : undefined;
    if (!target) return { ...tower, cooldownMs: Math.max(0, cooldownMs) };
    const splashed =
      tower.splashRadius === undefined
        ? []
        : alive.filter(
            (enemy) =>
              enemy.id !== target.id &&
              tower.targets.includes(enemy.layer) &&
              Math.hypot(enemy.position.x - target.position.x, enemy.position.y - target.position.y) <=
                tower.splashRadius!,
          );
    const hits: Hit[] = [];
    for (const enemy of [target, ...splashed]) {
      const damage = damageTaken(tower.damage, enemy.armor, tower.armorPierce ?? 0, enemy.hp);
      hits.push({ enemyId: enemy.id, damage });
      const hurt = { ...enemy, hp: enemy.hp - damage };
      if (hurt.hp === 0) {
        kills.push(hurt);
        alive = alive.filter((other) => other.id !== hurt.id);
      } else {
        alive = alive.map((other) => (other.id === hurt.id ? hurt : other));
      }
    }
    shots.push({ towerId: tower.id, targetId: target.id, position: target.position, hits });
    // A tower that came off cooldown mid-tick fired late; take that time off its next cooldown.
    // One that was already waiting at 0 only now saw a target, so it gets a full cooldown.
    const lateMs = tower.cooldownMs > 0 ? Math.max(0, -cooldownMs) : 0;
    return { ...tower, cooldownMs: Math.max(0, 1000 / tower.fireRate - lateMs) };
  });
  return { towers: nextTowers, enemies: alive, shots, kills };
}

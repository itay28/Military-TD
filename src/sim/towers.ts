import type { TowerKind } from '../data/towers';
import type { Enemy } from './enemies';
import { tileCenter, type Position, type Tile } from './map';

export interface TowerStats {
  /** Money to place it. */
  readonly cost: number;
  /** In tiles, from the tower's tile center. */
  readonly range: number;
  /** Shots per second. */
  readonly fireRate: number;
  /** HP taken per shot. */
  readonly damage: number;
}

/** A placed tower. Its stats are copied from its kind when it is placed. */
export interface Tower extends TowerStats {
  readonly id: number;
  readonly kind: TowerKind;
  readonly tile: Tile;
  /** Time until it can fire again; 0 when ready. */
  readonly cooldownMs: number;
}

/** One hit: `towerId` shot `targetId`. */
export interface Shot {
  readonly towerId: number;
  readonly targetId: number;
  /** Where the target was when hit, for the tracer's end even if the shot killed it. */
  readonly position: Position;
}

/** Slack for float sums of tick times, so a shot due on a tick fires on it. */
const COOLDOWN_EPSILON = 1e-9;

/**
 * The enemy in range (inclusive, from the tile center) furthest along the Path ("first").
 * Ties go to the one earlier in `enemies`, i.e. spawned first.
 */
export function selectTarget(tower: Tower, enemies: readonly Enemy[]): Enemy | undefined {
  const center = tileCenter(tower.tile);
  let target: Enemy | undefined;
  for (const enemy of enemies) {
    const inRange = Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y) <= tower.range;
    if (inRange && (!target || enemy.distance > target.distance)) target = enemy;
  }
  return target;
}

/**
 * Counts each tower's cooldown down by `dtMs`; a ready tower with a target hits it once for `damage`.
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
    shots.push({ towerId: tower.id, targetId: target.id, position: target.position });
    const hit = { ...target, hp: Math.max(0, target.hp - tower.damage) };
    if (hit.hp === 0) {
      kills.push(hit);
      alive = alive.filter((enemy) => enemy.id !== hit.id);
    } else {
      alive = alive.map((enemy) => (enemy.id === hit.id ? hit : enemy));
    }
    // A tower that came off cooldown mid-tick fired late; take that time off its next cooldown.
    // One that was already waiting at 0 only now saw a target, so it gets a full cooldown.
    const lateMs = tower.cooldownMs > 0 ? Math.max(0, -cooldownMs) : 0;
    return { ...tower, cooldownMs: Math.max(0, 1000 / tower.fireRate - lateMs) };
  });
  return { towers: nextTowers, enemies: alive, shots, kills };
}

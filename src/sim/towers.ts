import { TOWER_LEVELS, TOWER_STATS, type TowerKind } from '../data/towers';
import { damageTaken, type Layer } from './combat';
import type { Enemy } from './enemies';
import { tileCenter, type Position, type Tile } from './map';
import type { ShellStats } from './shells';

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
  /** Set for a tower that lobs shells: a shot becomes a Shell that lands later, instead of hitting at once. */
  readonly shell?: ShellStats;
}

/**
 * A placed tower. Its stats are copied from its kind's level when it is placed or upgraded;
 * `cost` stays what it cost to place.
 */
export interface Tower extends TowerStats {
  readonly id: number;
  readonly kind: TowerKind;
  readonly tile: Tile;
  /** Time until it can fire again; 0 when ready. */
  readonly cooldownMs: number;
  /** 1 when placed; each upgrade adds 1, up to `towerLevels(kind).length`. */
  readonly level: number;
  /** Money put into it: its cost plus every upgrade's. */
  readonly spent: number;
}

/** Every level's stats for `kind`, level 1 (`TOWER_STATS`) first. */
export function towerLevels(kind: TowerKind): readonly TowerStats[] {
  return [TOWER_STATS[kind], ...TOWER_LEVELS[kind]];
}

/** The stats of the level after the tower's, or undefined at the top level. */
export function nextLevel(tower: Tower): TowerStats | undefined {
  return towerLevels(tower.kind)[tower.level];
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

/** A shell tower's shot: it fired at `target`, a spot the game turns into a Shell (see `createShell`). */
export interface ShellLaunch {
  readonly tower: Tower;
  readonly target: Position;
  /** The tower's `shell`, known to be set. */
  readonly shell: ShellStats;
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
 * for `damage` less the target's armor (see `damageTaken`).
 * A tower with `shell` doesn't hit: it returns a launch at its target's position, to become a Shell.
 * Towers act in order, and an enemy at 0 HP is removed at once, so later towers retarget.
 * Time past the end of a cooldown carries into the next, so the fire rate holds at any tick size;
 * an idle tower waits at 0, ready.
 */
export function fireTowers(
  towers: readonly Tower[],
  enemies: readonly Enemy[],
  dtMs: number,
): { towers: Tower[]; enemies: Enemy[]; shots: Shot[]; launches: ShellLaunch[]; kills: Enemy[] } {
  let alive = [...enemies];
  const shots: Shot[] = [];
  const launches: ShellLaunch[] = [];
  const kills: Enemy[] = [];
  const nextTowers = towers.map((tower) => {
    const cooldownMs = tower.cooldownMs - dtMs;
    const target = cooldownMs <= COOLDOWN_EPSILON ? selectTarget(tower, alive) : undefined;
    if (!target) return { ...tower, cooldownMs: Math.max(0, cooldownMs) };
    if (tower.shell) launches.push({ tower, target: target.position, shell: tower.shell });
    else fireDirect(tower, target);
    // A tower that came off cooldown mid-tick fired late; take that time off its next cooldown.
    // One that was already waiting at 0 only now saw a target, so it gets a full cooldown.
    const lateMs = tower.cooldownMs > 0 ? Math.max(0, -cooldownMs) : 0;
    return { ...tower, cooldownMs: Math.max(0, 1000 / tower.fireRate - lateMs) };
  });
  return { towers: nextTowers, enemies: alive, shots, launches, kills };

  function fireDirect(tower: Tower, target: Enemy): void {
    const damage = damageTaken(tower.damage, target.armor, tower.armorPierce ?? 0, target.hp);
    shots.push({
      towerId: tower.id,
      targetId: target.id,
      position: target.position,
      hits: [{ enemyId: target.id, damage }],
    });
    const hit = { ...target, hp: target.hp - damage };
    if (hit.hp === 0) {
      kills.push(hit);
      alive = alive.filter((enemy) => enemy.id !== hit.id);
    } else {
      alive = alive.map((enemy) => (enemy.id === hit.id ? hit : enemy));
    }
  }
}

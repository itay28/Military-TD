import {
  AIM_TOLERANCE,
  RETARGET_MARGIN_S,
  TOWER_LEVELS,
  TOWER_STATS,
  TURN_RATES,
  trackHorizon,
  type TowerKind,
} from '../data/towers';
import { aimAngle, turnToward, wrap } from './aim';
import { damageTaken, type Layer } from './combat';
import type { CoverageInterval } from './coverage';
import type { Enemy } from './enemies';
import { tileCenter, type Position, type Tile } from './map';
import type { ShellStats } from './shells';

export interface TowerStats {
  /** Money to place it. */
  readonly cost: number;
  /** In tiles, from the tower's tile center. */
  readonly range: number;
  /** In tiles: the dead zone around the tile center it can't fire into (exclusive); none when left out. */
  readonly minRange?: number;
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
  /** Time left until a sold tower is gone; undefined while it stands. A dismantling tower doesn't fire. */
  readonly dismantleMs?: number;
  /** Where its turret points, in radians (0 east, rows grow down); it turns at its kind's `TURN_RATES`. */
  readonly heading: number;
  /**
   * The stretches of the Path it can fire on, from `coverageIntervals`; the game sets them when it is placed and
   * upgraded. With none, an idle tower keeps its heading.
   */
  readonly coverage?: readonly CoverageInterval[];
  /** The enemy an idle tower is pre-aiming at (see `preAim`), kept until another comes in clearly sooner. */
  readonly preAimId?: number | undefined;
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
 * An enemy at or inside the tower's `minRange` isn't a target.
 * Ties go to the one earlier in `enemies`, i.e. spawned first.
 */
export function selectTarget(tower: Tower, enemies: readonly Enemy[]): Enemy | undefined {
  const center = tileCenter(tower.tile);
  let target: Enemy | undefined;
  for (const enemy of enemies) {
    if (!tower.targets.includes(enemy.layer)) continue;
    const gap = Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y);
    const inRange = gap <= tower.range && (tower.minRange === undefined || gap > tower.minRange);
    if (inRange && (!target || enemy.distance > target.distance)) target = enemy;
  }
  return target;
}

/** Where an idle tower turns: toward `point`, laid for enemy `enemyId` when it has one. */
export interface PreAim {
  readonly point: Position;
  readonly enemyId?: number;
}

/**
 * Where a tower with no target in range lays its turret (#372): on the entry point of the coverage interval the
 * soonest-engaging enemy will reach next. An enemy's time to engage is the longer of its walk to that entry
 * (`(enter − distance) / speed`) and the turret's turn to face it; only enemies on a layer the tower hits, with an
 * interval ahead, and engaging within `trackHorizon(kind)` count. Ties go to the one furthest along. The tower keeps
 * the enemy it was laying on (`preAimId`) unless another engages sooner by more than `RETARGET_MARGIN_S`.
 * With no such enemy, it faces its first interval's entry; with no coverage, or no turn rate (the Mortar), undefined.
 */
export function preAim(tower: Tower, enemies: readonly Enemy[]): PreAim | undefined {
  const turnRate = TURN_RATES[tower.kind];
  const horizon = trackHorizon(tower.kind);
  const first = tower.coverage?.[0];
  if (turnRate === null || horizon === null || !first) return undefined;
  const center = tileCenter(tower.tile);
  let best: { enemy: Enemy; point: Position; time: number } | undefined;
  let kept: typeof best;
  for (const enemy of enemies) {
    if (!tower.targets.includes(enemy.layer) || enemy.speed <= 0) continue;
    const next = tower.coverage!.find((interval) => interval.enter > enemy.distance);
    if (!next) continue;
    const turn = Math.abs(wrap(Math.atan2(next.entry.y - center.y, next.entry.x - center.x) - tower.heading));
    const time = Math.max((next.enter - enemy.distance) / enemy.speed, turn / turnRate);
    if (time > horizon) continue;
    const candidate = { enemy, point: next.entry, time };
    if (enemy.id === tower.preAimId) kept = candidate;
    if (!best || time < best.time || (time === best.time && enemy.distance > best.enemy.distance)) best = candidate;
  }
  const chosen = kept && best && best.time >= kept.time - RETARGET_MARGIN_S ? kept : best;
  return chosen ? { point: chosen.point, enemyId: chosen.enemy.id } : { point: first.entry };
}

/**
 * Counts each tower's cooldown down by `dtMs` and turns it toward its target at its kind's turn rate (`TURN_RATES`);
 * a ready tower facing its target (within `AIM_TOLERANCE`) hits it once, for `damage` less the target's armor
 * (see `damageTaken`). A kind with no turn rate (the Mortar) faces its target at once.
 * A tower with `shell` doesn't hit: it returns a launch at its target's position, to become a Shell.
 * Towers act in order, and an enemy at 0 HP is removed at once, so later towers retarget.
 * A tower with no target in range turns toward its `preAim` point instead.
 * A dismantling tower neither turns nor fires.
 * Time past the end of a cooldown carries into the next, so the fire rate holds at any tick size;
 * an idle or still-turning tower waits at 0, ready.
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
    if (tower.dismantleMs !== undefined) return tower;
    const cooldownMs = tower.cooldownMs - dtMs;
    const target = selectTarget(tower, alive);
    const laid = target ? undefined : preAim(tower, alive);
    const aim = aimAngle(tileCenter(tower.tile), target?.position ?? laid?.point, tower.heading);
    const preAimId = laid?.enemyId;
    const turnRate = TURN_RATES[tower.kind];
    const heading = turnRate === null ? wrap(aim) : turnToward(tower.heading, aim, (turnRate * dtMs) / 1000);
    const aimed = Math.abs(wrap(aim - heading)) <= AIM_TOLERANCE;
    if (!target || !aimed || cooldownMs > COOLDOWN_EPSILON)
      return { ...tower, heading, preAimId, cooldownMs: Math.max(0, cooldownMs) };
    if (tower.shell) launches.push({ tower, target: target.position, shell: tower.shell });
    else fireDirect(tower, target);
    // A tower that came off cooldown mid-tick fired late; take that time off its next cooldown.
    // One that was already waiting at 0 only now saw (or faced) a target, so it gets a full cooldown.
    const lateMs = tower.cooldownMs > 0 ? Math.max(0, -cooldownMs) : 0;
    return { ...tower, heading, preAimId, cooldownMs: Math.max(0, 1000 / tower.fireRate - lateMs) };
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

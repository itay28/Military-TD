import { damageTaken, type Layer } from './combat';
import type { Enemy } from './enemies';
import type { Position } from './map';
import type { Hit } from './towers';

/** What makes a tower lob shells instead of hitting at once. */
export interface ShellStats {
  /** Time from firing to landing. */
  readonly flightMs: number;
  /** In tiles, from the landing point: enemies within it take the full damage. */
  readonly innerRadius: number;
  /** In tiles: enemies within it, past the inner ring, take half the damage (rounded down). */
  readonly outerRadius: number;
}

/**
 * A shell in flight, aimed at where its target was when fired (no leading).
 * It copies what its tower hits with, so it lands even if the tower is gone.
 */
export interface Shell extends ShellStats {
  readonly id: number;
  readonly towerId: number;
  /** The tower's tile center, for drawing the flight. */
  readonly from: Position;
  readonly target: Position;
  readonly firedAtMs: number;
  readonly landsAtMs: number;
  /** HP taken per enemy in the inner ring, before armor. */
  readonly damage: number;
  readonly armorPierce: number;
  readonly targets: readonly Layer[];
}

/** One shell's landing: where, and every enemy it damaged. */
export interface ShellLanding {
  readonly shellId: number;
  readonly towerId: number;
  readonly position: Position;
  readonly hits: readonly Hit[];
}

/** Slack for float sums of tick times, so a shell due on a tick lands on it. */
const LANDING_EPSILON = 1e-9;

/**
 * Lands every shell due by `nowMs`, in fire order (the order of `shells`). Each damages the enemies it can hit
 * within its rings of the landing point, as they stand now: full in the inner ring, half (rounded down) in the outer,
 * each less armor (see `damageTaken`). An enemy at 0 HP is removed at once, so a later shell doesn't see it.
 */
export function landShells(
  shells: readonly Shell[],
  enemies: readonly Enemy[],
  nowMs: number,
): { shells: Shell[]; enemies: Enemy[]; landed: ShellLanding[]; kills: Enemy[] } {
  let alive = [...enemies];
  const inFlight: Shell[] = [];
  const landed: ShellLanding[] = [];
  const kills: Enemy[] = [];
  for (const shell of shells) {
    if (shell.landsAtMs > nowMs + LANDING_EPSILON) {
      inFlight.push(shell);
      continue;
    }
    const hits: Hit[] = [];
    alive = alive.flatMap((enemy) => {
      if (!shell.targets.includes(enemy.layer)) return [enemy];
      const distance = Math.hypot(enemy.position.x - shell.target.x, enemy.position.y - shell.target.y);
      if (distance > shell.outerRadius) return [enemy];
      const raw = distance <= shell.innerRadius ? shell.damage : Math.floor(shell.damage / 2);
      const damage = damageTaken(raw, enemy.armor, shell.armorPierce, enemy.hp);
      hits.push({ enemyId: enemy.id, damage });
      const hit = { ...enemy, hp: enemy.hp - damage };
      if (hit.hp > 0) return [hit];
      kills.push(hit);
      return [];
    });
    landed.push({ shellId: shell.id, towerId: shell.towerId, position: shell.target, hits });
  }
  return { shells: inFlight, enemies: alive, landed, kills };
}

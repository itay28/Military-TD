import type { EnemyKind } from '../data/enemies';
import type { Position } from './map';

export interface EnemyStats {
  readonly maxHp: number;
  /** Tiles per second. */
  readonly speed: number;
  /** Money paid when it dies. */
  readonly reward: number;
  /** Lives lost when it leaks. */
  readonly leakCost: number;
}

/** An enemy on the Path. Its stats are copied from its kind when it spawns. */
export interface Enemy extends EnemyStats {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly hp: number;
  /** Tiles travelled along the Path from its start. */
  readonly distance: number;
  readonly position: Position;
}

/** The Path as a line through its waypoint tile centers, for measuring distance along it. */
export interface PathLine {
  /** In tiles. */
  readonly length: number;
  /** The point `distance` tiles along the line, clamped to its ends; exact at waypoints. */
  positionAt(distance: number): Position;
}

export function createPathLine(points: readonly Position[]): PathLine {
  // startDistances[i] is the distance along the line at points[i].
  const startDistances = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    startDistances.push(startDistances[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const length = startDistances[startDistances.length - 1]!;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  return {
    length,
    positionAt(distance) {
      if (distance <= 0) return first;
      if (distance >= length) return last;
      let i = 1;
      while (startDistances[i]! < distance) i++;
      const a = points[i - 1]!;
      const b = points[i]!;
      const t = (distance - startDistances[i - 1]!) / (startDistances[i]! - startDistances[i - 1]!);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
  };
}

/** Slack for float sums of tick distances, so an enemy due at the end on a tick arrives on it. */
const DISTANCE_EPSILON = 1e-9;

/**
 * Moves each enemy `speed × dtMs` along the line. Enemies that reach the end leak:
 * they are returned in `leaked`, placed at the end, in their original order.
 */
export function walkEnemies(
  enemies: readonly Enemy[],
  line: PathLine,
  dtMs: number,
): { walking: Enemy[]; leaked: Enemy[] } {
  const walking: Enemy[] = [];
  const leaked: Enemy[] = [];
  for (const enemy of enemies) {
    const distance = enemy.distance + (enemy.speed * dtMs) / 1000;
    if (distance >= line.length - DISTANCE_EPSILON) {
      leaked.push({ ...enemy, distance: line.length, position: line.positionAt(line.length) });
    } else {
      walking.push({ ...enemy, distance, position: line.positionAt(distance) });
    }
  }
  return { walking, leaked };
}

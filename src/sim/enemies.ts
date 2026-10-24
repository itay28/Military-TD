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

export interface Enemy {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly hp: number;
  readonly maxHp: number;
  /** Tiles per second. */
  readonly speed: number;
  /** Tiles travelled along the Path from its start. */
  readonly distance: number;
  readonly position: Position;
}

/** The polyline enemies walk, through the waypoint tile centers. */
export interface Route {
  /** In tiles. */
  readonly length: number;
  /** The point `distance` tiles along the route, clamped to its ends; exact at waypoints. */
  positionAt(distance: number): Position;
}

export function createRoute(points: readonly Position[]): Route {
  // starts[i] is the distance along the route at points[i].
  const starts = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    starts.push(starts[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const length = starts[starts.length - 1]!;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  return {
    length,
    positionAt(distance) {
      if (distance <= 0) return first;
      if (distance >= length) return last;
      let i = 1;
      while (starts[i]! < distance) i++;
      const a = points[i - 1]!;
      const b = points[i]!;
      const t = (distance - starts[i - 1]!) / (starts[i]! - starts[i - 1]!);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
  };
}

import type { EnemyKind } from '../data/enemies';
import { SPRITE_HEADING } from '../data/sprites';
import type { Position } from '../sim/map';

/**
 * The way an enemy is heading, in radians on the canvas (0 east, π/2 south, as y grows down): the direction from its
 * previous tick position to its current one, the line the frames between them interpolate along. Across a Path
 * corner that line cuts the corner, so the turn shows part way for a tick. Keeps `fallback` (its last heading) when
 * it has no previous position (it just spawned) or didn't move.
 */
export function headingOf(from: Position | undefined, to: Position, fallback: number): number {
  if (!from || (from.x === to.x && from.y === to.y)) return fallback;
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** The rotation that turns `kind`'s sprite from the way its frame faces to `heading`. */
export function spriteRotation(kind: EnemyKind, heading: number): number {
  return heading - SPRITE_HEADING[kind];
}

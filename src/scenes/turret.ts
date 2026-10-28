import type { Position } from '../sim/map';

/**
 * The angle from `from` toward `target`, in radians: 0 is east, −π/2 north (rows grow down).
 * With no target, or one on `from` itself, the turret keeps `last`.
 */
export function aimAngle(from: Position, target: Position | undefined, last: number): number {
  if (!target) return last;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  return dx === 0 && dy === 0 ? last : Math.atan2(dy, dx);
}

/** `angle` wrapped into (−π, π]. */
function wrap(angle: number): number {
  const turns = Math.ceil((angle - Math.PI) / (2 * Math.PI));
  return angle - turns * 2 * Math.PI;
}

/** `current` turned toward `desired` the short way round, by at most `maxStep` radians; the result is in (−π, π]. */
export function turnToward(current: number, desired: number, maxStep: number): number {
  const diff = wrap(desired - current);
  if (Math.abs(diff) <= maxStep) return wrap(desired);
  return wrap(current + Math.sign(diff) * maxStep);
}

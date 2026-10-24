import type { Position } from '../sim/map';

/** Anything the sim moves: an id that stays the same across ticks, and where it is now. */
export interface Positioned {
  readonly id: number;
  readonly position: Position;
}

/** Positions by id, taken just before a tick so the frame after it can interpolate from them. */
export function snapshotPositions(entities: readonly Positioned[]): ReadonlyMap<number, Position> {
  return new Map(entities.map((entity) => [entity.id, entity.position]));
}

/**
 * Where to draw `entity` `alpha` of the way from its previous tick position to its current one.
 * The sim ticks at a fixed rate and frames fall between ticks, so this keeps motion smooth at any refresh rate.
 * An entity with no previous position just appeared and is drawn where it is.
 */
export function interpolatePosition(
  previous: ReadonlyMap<number, Position>,
  entity: Positioned,
  alpha: number,
): Position {
  const from = previous.get(entity.id);
  if (!from) return entity.position;
  const to = entity.position;
  return { x: from.x + (to.x - from.x) * alpha, y: from.y + (to.y - from.y) * alpha };
}

import type { PathLine } from './enemies';
import type { Position } from './map';

/** A stretch of the Path inside a tower's firing range: from `enter` to `exit`, in tiles along the Path. */
export interface CoverageInterval {
  readonly enter: number;
  readonly exit: number;
  /** Where the Path enters it: the point at `enter`, where a pre-aiming turret is laid. */
  readonly entry: Position;
}

/** Gaps this small between two stretches (float error at a bend) join them into one. */
const JOIN_EPSILON = 1e-9;

/**
 * The stretches of `line` a tower at `center` can fire on: within `range` (inclusive) and outside `minRange`
 * (exclusive), the same rule as targeting. In walking order; a Path that leaves and re-enters range gives one
 * per pass. Exact: each straight segment is cut against the range circles.
 */
export function coverageIntervals(
  line: PathLine,
  center: Position,
  range: number,
  minRange?: number,
): CoverageInterval[] {
  const spans: [number, number][] = [];
  let start = 0;
  line.points.forEach((b, i) => {
    const a = line.points[i - 1];
    if (!a) return;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) return;
    const inside = chord(a, b, length, center, range);
    if (inside) {
      const dead = minRange === undefined ? undefined : chord(a, b, length, center, minRange);
      for (const [from, to] of dead ? subtract(inside, dead) : [inside]) spans.push([start + from, start + to]);
    }
    start += length;
  });

  const joined: [number, number][] = [];
  for (const span of spans) {
    const last = joined[joined.length - 1];
    if (last && span[0] - last[1] <= JOIN_EPSILON) last[1] = Math.max(last[1], span[1]);
    else joined.push([...span]);
  }
  return joined.map(([enter, exit]) => ({ enter, exit, entry: line.positionAt(enter) }));
}

/** The part of segment a→b (as distances from `a`, 0 to `length`) within `radius` of `center`, if any. */
function chord(
  a: Position,
  b: Position,
  length: number,
  center: Position,
  radius: number,
): [number, number] | undefined {
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  // Distance along the segment of the point nearest the center, and the squared gap from the center to it.
  const along = (center.x - a.x) * ux + (center.y - a.y) * uy;
  const offX = a.x + ux * along - center.x;
  const offY = a.y + uy * along - center.y;
  const half2 = radius * radius - (offX * offX + offY * offY);
  if (half2 < 0) return undefined;
  const half = Math.sqrt(half2);
  const from = Math.max(0, along - half);
  const to = Math.min(length, along + half);
  return from <= to ? [from, to] : undefined;
}

/** `[from, to]` less the open stretch `(cutFrom, cutTo)`. */
function subtract([from, to]: [number, number], [cutFrom, cutTo]: [number, number]): [number, number][] {
  const parts: [number, number][] = [];
  if (cutFrom > from) parts.push([from, Math.min(to, cutFrom)]);
  if (cutTo < to) parts.push([Math.max(from, cutTo), to]);
  return parts;
}

import type { Pixel } from './coords';

/** The part of a Shell the view needs, with its points in pixels. */
export interface FlightPath {
  readonly from: Pixel;
  readonly target: Pixel;
  readonly firedAtMs: number;
  readonly landsAtMs: number;
}

/** Where a shell is at sim time `nowMs`: a straight line from `from` to `target`, clamped to the flight. */
export function shellPoint({ from, target, firedAtMs, landsAtMs }: FlightPath, nowMs: number): Pixel {
  const t = Math.min(1, Math.max(0, (nowMs - firedAtMs) / (landsAtMs - firedAtMs)));
  return { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t };
}

/** A blast circle to draw this frame. */
export interface BlastCircle {
  readonly center: Pixel;
  /** In pixels. */
  readonly radius: number;
  /** 1 when it lands, fading linearly to 0. */
  readonly alpha: number;
}

export interface Blasts {
  add(center: Pixel, radius: number): void;
  /** Ages every blast by a frame's real elapsed time and drops the ones that have faded out. */
  advance(dtMs: number): void;
  active(): BlastCircle[];
}

/** Short-lived blast circles. Cosmetic only, so they run on frame time, not sim ticks. */
export function createBlasts(fadeMs: number): Blasts {
  let blasts: { center: Pixel; radius: number; ageMs: number }[] = [];
  return {
    add(center, radius) {
      blasts.push({ center, radius, ageMs: 0 });
    },
    advance(dtMs) {
      for (const blast of blasts) blast.ageMs += dtMs;
      blasts = blasts.filter((blast) => blast.ageMs < fadeMs);
    },
    // Filtered here too, so a fade time of 0 (?anim=0) never shows a blast added since the last advance.
    active: () =>
      blasts
        .filter((blast) => blast.ageMs < fadeMs)
        .map(({ center, radius, ageMs }) => ({ center, radius, alpha: 1 - ageMs / fadeMs })),
  };
}

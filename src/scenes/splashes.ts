import type { Pixel } from './coords';

/** A splash circle to draw this frame. */
export interface SplashCircle {
  readonly at: Pixel;
  /** In pixels. */
  readonly radius: number;
  /** 1 when fired, fading linearly to 0. */
  readonly alpha: number;
}

export interface Splashes {
  add(at: Pixel, radius: number): void;
  /** Ages every splash by a frame's real elapsed time and drops the ones that have faded out. */
  advance(dtMs: number): void;
  active(): SplashCircle[];
}

/** Short-lived blast circles. Cosmetic only, so they run on frame time, not sim ticks. */
export function createSplashes(lifetimeMs: number): Splashes {
  let splashes: { at: Pixel; radius: number; ageMs: number }[] = [];
  return {
    add(at, radius) {
      splashes.push({ at, radius, ageMs: 0 });
    },
    advance(dtMs) {
      for (const splash of splashes) splash.ageMs += dtMs;
      splashes = splashes.filter((splash) => splash.ageMs < lifetimeMs);
    },
    // Filtered here too, so a lifetime of 0 (?anim=0) never shows a splash added since the last advance.
    active: () =>
      splashes
        .filter((splash) => splash.ageMs < lifetimeMs)
        .map(({ at, radius, ageMs }) => ({ at, radius, alpha: 1 - ageMs / lifetimeMs })),
  };
}

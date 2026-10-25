import type { Pixel } from './coords';

/** A tracer to draw this frame: a line from the tower to where its target was hit. */
export interface TracerLine {
  readonly from: Pixel;
  readonly to: Pixel;
  /** 1 when fired, fading linearly to 0. */
  readonly alpha: number;
}

export interface Tracers {
  add(from: Pixel, to: Pixel): void;
  /** Ages every tracer by a frame's real elapsed time and drops the ones that have faded out. */
  advance(dtMs: number): void;
  active(): TracerLine[];
}

/** Short-lived shot lines. Cosmetic only, so they run on frame time, not sim ticks. */
export function createTracers(fadeMs: number): Tracers {
  let tracers: { from: Pixel; to: Pixel; ageMs: number }[] = [];
  return {
    add(from, to) {
      tracers.push({ from, to, ageMs: 0 });
    },
    advance(dtMs) {
      for (const tracer of tracers) tracer.ageMs += dtMs;
      tracers = tracers.filter((tracer) => tracer.ageMs < fadeMs);
    },
    active: () => tracers.map(({ from, to, ageMs }) => ({ from, to, alpha: 1 - ageMs / fadeMs })),
  };
}

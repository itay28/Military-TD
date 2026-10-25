import type { TowerKind } from '../data/towers';
import type { Pixel } from './coords';

/** A tracer to draw this frame: a line from the tower to where its target was hit. */
export interface TracerLine {
  readonly from: Pixel;
  readonly to: Pixel;
  /** The firing tower's kind, which picks the line's style. */
  readonly kind: TowerKind;
  /** 1 when fired, fading linearly to 0. */
  readonly alpha: number;
}

export interface Tracers {
  add(from: Pixel, to: Pixel, kind: TowerKind): void;
  /** Ages every tracer by a frame's real elapsed time and drops the ones that have faded out. */
  advance(dtMs: number): void;
  active(): TracerLine[];
}

/** Short-lived shot lines. Cosmetic only, so they run on frame time, not sim ticks. */
export function createTracers(fadeMs: number): Tracers {
  let tracers: { from: Pixel; to: Pixel; kind: TowerKind; ageMs: number }[] = [];
  return {
    add(from, to, kind) {
      tracers.push({ from, to, kind, ageMs: 0 });
    },
    advance(dtMs) {
      for (const tracer of tracers) tracer.ageMs += dtMs;
      tracers = tracers.filter((tracer) => tracer.ageMs < fadeMs);
    },
    // Filtered here too, so a fade time of 0 (?anim=0) never shows a tracer added since the last advance.
    active: () =>
      tracers
        .filter((tracer) => tracer.ageMs < fadeMs)
        .map(({ from, to, kind, ageMs }) => ({ from, to, kind, alpha: 1 - ageMs / fadeMs })),
  };
}

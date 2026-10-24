/** Absorbs float error from steps like 1000/60, so 50 ms of frames runs exactly 3 steps, not 2. */
const FLOAT_TOLERANCE_MS = 1e-6;

export interface FixedStepOptions {
  readonly stepMs: number;
  /** Steps allowed in one frame. Past it, the backlog is dropped and the game runs slower than real time. */
  readonly maxStepsPerFrame: number;
  step(dtMs: number): void;
}

export interface FixedStep {
  /** Adds a frame's real elapsed time and runs the whole steps that fit. Returns how many ran. */
  advance(frameDeltaMs: number): number;
}

/**
 * The fixed-timestep accumulator. It has no Phaser in it so it can be unit tested.
 * Capping steps per frame avoids the spiral of death: after a stall (background tab, GC pause)
 * catching up would make the next frame slower still, so the unrun time is dropped instead.
 */
export function createFixedStep({ stepMs, maxStepsPerFrame, step }: FixedStepOptions): FixedStep {
  let accumulatedMs = 0;
  const fitsAStep = () => accumulatedMs + FLOAT_TOLERANCE_MS >= stepMs;
  return {
    advance(frameDeltaMs) {
      if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) return 0;
      accumulatedMs += frameDeltaMs;
      let steps = 0;
      while (fitsAStep() && steps < maxStepsPerFrame) {
        step(stepMs);
        accumulatedMs -= stepMs;
        steps++;
      }
      if (fitsAStep()) accumulatedMs = 0;
      return steps;
    },
  };
}

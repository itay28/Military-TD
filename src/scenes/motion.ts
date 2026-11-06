import { EFFECT, FLOATING_TEXT, REDUCED_MOTION, SHELL, TRACER } from '../data/display';

/** A value, or a getter read each time it's needed, so a setting changed mid-game applies from the next frame. */
export type Live<T> = T | (() => T);

export function readLive<T>(value: Live<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

/** How long each cosmetic lasts, and whether it moves (#354). */
export interface MotionTimings {
  /** Muzzle flash, explosion and death puff. */
  readonly effectLifeMs: number;
  readonly tracerFadeMs: number;
  /** The Mortar shell's blast ring. */
  readonly blastFadeMs: number;
  /** Refusal and refund messages. */
  readonly floatingText: { readonly durationMs: number; readonly risePx: number };
  /** The enemies' walk bob and rotor cycle. */
  readonly enemyWalk: boolean;
}

/**
 * The cosmetic timings for the player's reduced-motion setting and the `?anim` flag. Reduced motion stills what is
 * only decoration (the rising text, the walk cycle) and shortens what carries information (flashes, tracers, blasts:
 * ADR-0009) without removing it. `?anim=0` turns every cosmetic off, as before.
 */
export function motionTimings({ reducedMotion, anim }: { reducedMotion: boolean; anim: boolean }): MotionTimings {
  if (!anim)
    return {
      effectLifeMs: 0,
      tracerFadeMs: 0,
      blastFadeMs: 0,
      floatingText: { durationMs: 0, risePx: 0 },
      enemyWalk: false,
    };
  if (reducedMotion)
    return {
      effectLifeMs: REDUCED_MOTION.effectLifeMs,
      tracerFadeMs: REDUCED_MOTION.tracerFadeMs,
      blastFadeMs: REDUCED_MOTION.blastFadeMs,
      floatingText: { durationMs: FLOATING_TEXT.durationMs, risePx: 0 },
      enemyWalk: false,
    };
  return {
    effectLifeMs: EFFECT.lifeMs,
    tracerFadeMs: TRACER.fadeMs,
    blastFadeMs: SHELL.blastFadeMs,
    floatingText: { durationMs: FLOATING_TEXT.durationMs, risePx: FLOATING_TEXT.risePx },
    enemyWalk: true,
  };
}

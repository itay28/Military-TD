import type { Pixel } from './coords';

export type EffectKind = 'muzzleFlash' | 'explosion' | 'puff';

/** An effect to draw this frame. */
export interface EffectView {
  readonly kind: EffectKind;
  readonly at: Pixel;
  /** 0 when it starts, reaching 1 as it ends. */
  readonly progress: number;
}

export interface Effects {
  add(kind: EffectKind, at: Pixel): void;
  /** Ages every effect by a frame's real elapsed time and drops the ones that are over. */
  advance(dtMs: number): void;
  active(): EffectView[];
}

/** Short-lived combat effects (muzzle flash, explosion, death puff). Cosmetic only, so they run on frame time, not sim ticks. */
export function createEffects(lifeMs: number): Effects {
  let effects: { kind: EffectKind; at: Pixel; ageMs: number }[] = [];
  return {
    add(kind, at) {
      effects.push({ kind, at, ageMs: 0 });
    },
    advance(dtMs) {
      for (const effect of effects) effect.ageMs += dtMs;
      effects = effects.filter((effect) => effect.ageMs < lifeMs);
    },
    // Filtered here too, so a life of 0 (?anim=0) never shows an effect added since the last advance.
    active: () =>
      effects
        .filter((effect) => effect.ageMs < lifeMs)
        .map(({ kind, at, ageMs }) => ({ kind, at, progress: ageMs / lifeMs })),
  };
}

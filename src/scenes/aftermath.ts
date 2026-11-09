import { AFTERMATH, type DecalKind } from '../data/display';
import type { Pixel } from './coords';

export type { DecalKind };

/** How long a decal kind lasts: opaque for `holdMs` (burning, if it `burns`), then fading out over `fadeMs`. */
export interface DecalTiming {
  readonly holdMs: number;
  readonly fadeMs: number;
  readonly burns: boolean;
  /** How long it takes to tip over, from the start (fallen infantry). */
  readonly fallMs?: number;
}

export type AftermathTimings = Readonly<Record<DecalKind, DecalTiming>> & {
  /** The quick fade of a decal pushed out over the cap. */
  readonly evictFadeMs: number;
};

/** The way a decal lies and how big it is, from what made it. */
export interface DecalShape {
  /** Radians on the canvas, 0 east. */
  readonly heading: number;
  /** In pixels: the vehicle's or blast's radius. */
  readonly size: number;
}

/** A decal to draw this frame. */
export interface DecalView extends DecalShape {
  readonly kind: DecalKind;
  readonly at: Pixel;
  /** 1 opaque, 0 gone. */
  readonly alpha: number;
  /** How long it has burned, in ms, while its fire is still going; undefined otherwise. */
  readonly fireMs: number | undefined;
  /** 0 standing, reaching 1 once it lies flat (always 1 for kinds that don't fall). */
  readonly fall: number;
}

export interface Aftermath {
  add(kind: DecalKind, at: Pixel, shape: DecalShape): void;
  /** Ages every decal by a frame's real elapsed time and drops the ones that are gone. */
  advance(dtMs: number): void;
  /** Oldest first, so newer decals draw over older ones. */
  active(): DecalView[];
}

interface Decal extends DecalShape {
  readonly kind: DecalKind;
  readonly at: Pixel;
  ageMs: number;
  /** Set once it's pushed out over the cap: how long it has been fading since. */
  evictedMs?: number;
}

/**
 * The battlefield's aftermath (#403). Cosmetic only, so it runs on frame time, like effects. At most `cap` decals stay
 * (the oldest fades out quickly to make room), and never more than twice that even under a burst of kills.
 */
export function createAftermath({ cap, timings }: { cap: number; timings: AftermathTimings }): Aftermath {
  let decals: Decal[] = [];
  const lifeOf = ({ kind }: Decal) => timings[kind].holdMs + timings[kind].fadeMs;
  const visible = (decal: Decal) =>
    decal.ageMs < lifeOf(decal) && (decal.evictedMs === undefined || decal.evictedMs < timings.evictFadeMs);

  const alphaOf = (decal: Decal): number => {
    const { holdMs, fadeMs } = timings[decal.kind];
    const own = decal.ageMs <= holdMs ? 1 : 1 - (decal.ageMs - holdMs) / fadeMs;
    const evict = decal.evictedMs === undefined ? 1 : 1 - decal.evictedMs / timings.evictFadeMs;
    return own * evict;
  };

  return {
    add(kind, at, { heading, size }) {
      decals.push({ kind, at, heading, size, ageMs: 0 });
      const live = decals.filter((decal) => decal.evictedMs === undefined);
      for (const decal of live.slice(0, Math.max(0, live.length - cap))) decal.evictedMs = 0;
      if (decals.length > 2 * cap) decals = decals.slice(decals.length - 2 * cap);
    },
    advance(dtMs) {
      for (const decal of decals) {
        decal.ageMs += dtMs;
        if (decal.evictedMs !== undefined) decal.evictedMs += dtMs;
      }
      decals = decals.filter(visible);
    },
    // Filtered here too, so a life of 0 (?anim=0) never shows a decal added since the last advance.
    active: () =>
      decals.filter(visible).map((decal) => {
        const { kind, at, heading, size, ageMs, evictedMs } = decal;
        const { holdMs, burns, fallMs = 0 } = timings[kind];
        return {
          kind,
          at,
          heading,
          size,
          alpha: alphaOf(decal),
          fireMs: burns && evictedMs === undefined && ageMs < holdMs ? ageMs : undefined,
          fall: fallMs > 0 ? Math.min(1, ageMs / fallMs) : 1,
        };
      }),
  };
}

/** The timings for the player's motion setting; all zero with `?anim=0`, so no decal ever shows. */
export function aftermathTimings({ anim, reducedMotion }: { anim: boolean; reducedMotion: boolean }): AftermathTimings {
  const fade = (ms: number) => (anim ? (reducedMotion ? ms * AFTERMATH.reducedFade : ms) : 0);
  // Reduced motion: no fire to burn, so the wreck starts fading at once; it lies flat from the start.
  const burnMs = anim && !reducedMotion ? AFTERMATH.burnMs : 0;
  const burns = burnMs > 0;
  return {
    wreck: { holdMs: burnMs, fadeMs: fade(AFTERMATH.wreckFadeMs), burns },
    crashMark: { holdMs: burnMs, fadeMs: fade(AFTERMATH.wreckFadeMs), burns },
    crater: { holdMs: 0, fadeMs: fade(AFTERMATH.craterFadeMs), burns: false },
    fallen: { holdMs: 0, fadeMs: fade(AFTERMATH.fallenFadeMs), burns: false, fallMs: burns ? AFTERMATH.fallMs : 0 },
    evictFadeMs: fade(AFTERMATH.evictFadeMs),
  };
}

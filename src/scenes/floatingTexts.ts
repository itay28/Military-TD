import type { Pixel } from './coords';

/** A floating text to draw this frame, at its current position and alpha. */
export interface FloatingTextView extends Pixel {
  /** Stable for the text's life, so the scene can keep one display object per text. */
  readonly id: number;
  readonly text: string;
  /** 1 when added, fading linearly to 0. */
  readonly alpha: number;
}

export interface FloatingTexts {
  /** Shows `text` at `at`; it rises and fades from there. */
  add(text: string, at: Pixel): void;
  /** Ages every text by a frame's real elapsed time and drops the ones that are done. */
  advance(dtMs: number): void;
  active(): FloatingTextView[];
}

/** Short messages that rise `risePx` and fade out over `durationMs`. Cosmetic only, so they run on frame time. */
export function createFloatingTexts({ durationMs, risePx }: { durationMs: number; risePx: number }): FloatingTexts {
  let nextId = 1;
  let texts: { id: number; text: string; at: Pixel; ageMs: number }[] = [];
  return {
    add(text, at) {
      texts.push({ id: nextId++, text, at, ageMs: 0 });
    },
    advance(dtMs) {
      for (const text of texts) text.ageMs += dtMs;
      texts = texts.filter((text) => text.ageMs < durationMs);
    },
    active: () =>
      texts.map(({ id, text, at, ageMs }) => {
        const progress = ageMs / durationMs;
        return { id, text, x: at.x, y: at.y - risePx * progress, alpha: 1 - progress };
      }),
  };
}

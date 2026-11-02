import type { SoundId } from './sounds';

/** Where the game sends its sounds: the Phaser sink when playing, a silent or recording one in tests. */
export interface AudioOut {
  play(id: SoundId): void;
}

/** Plays nothing: test mode, so e2e runs and scenarios stay silent (ADR-0003). */
export const silentAudio: AudioOut = { play: () => {} };

/** A fake that records each play, in order. */
export function createRecordingAudio(): AudioOut & { readonly played: SoundId[] } {
  const played: SoundId[] = [];
  return { played, play: (id) => played.push(id) };
}

export interface ThrottleConfig {
  /** The most plays of one sound inside any window. */
  readonly maxPlays: number;
  readonly windowMs: number;
}

/**
 * Wraps `sink` so a burst of one sound (a row of Rifle Nests firing together) doesn't stack: at most `maxPlays` of each
 * sound in any `windowMs`, the rest dropped. Different sounds don't limit each other.
 */
export function throttleAudio(sink: AudioOut, { maxPlays, windowMs }: ThrottleConfig, now: () => number): AudioOut {
  const recent = new Map<SoundId, number[]>();
  return {
    play(id) {
      const t = now();
      const times = (recent.get(id) ?? []).filter((at) => t - at < windowMs);
      recent.set(id, times);
      if (times.length >= maxPlays) return;
      times.push(t);
      sink.play(id);
    },
  };
}

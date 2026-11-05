import type { SoundId } from './sounds';

/** Where the game sends its sounds: the Phaser sink when playing, a silent or recording one in tests. */
export interface AudioOut {
  /** Plays `id` at `volume` (0–1, full by default). */
  play(id: SoundId, volume?: number): void;
}

/** Plays nothing: test mode, so e2e runs and scenarios stay silent (ADR-0003). */
export const silentAudio: AudioOut = { play: () => {} };

/** A fake that records each play, in order. */
export function createRecordingAudio(): AudioOut & { readonly played: SoundId[]; readonly volumes: number[] } {
  const played: SoundId[] = [];
  const volumes: number[] = [];
  return {
    played,
    volumes,
    play: (id, volume = 1) => {
      played.push(id);
      volumes.push(volume);
    },
  };
}

export interface ThrottleConfig {
  /** The most plays of one sound inside any window. */
  readonly maxPlays: number;
  readonly windowMs: number;
}

/**
 * Wraps `sink` so a burst of one sound (a row of Rifle Nests firing together) doesn't stack: at most `maxPlays` of each
 * sound in any `windowMs`, the rest dropped. Different sounds don't limit each other. `byId` gives a sound its own limit
 * (a burst of leaks calls the radio once, #405).
 */
export function throttleAudio(
  sink: AudioOut,
  config: ThrottleConfig,
  now: () => number,
  byId: Partial<Record<SoundId, ThrottleConfig>> = {},
): AudioOut {
  const recent = new Map<SoundId, number[]>();
  return {
    play(id, volume) {
      const { maxPlays, windowMs } = byId[id] ?? config;
      const t = now();
      const times = (recent.get(id) ?? []).filter((at) => t - at < windowMs);
      recent.set(id, times);
      if (times.length >= maxPlays) return;
      times.push(t);
      sink.play(id, volume);
    },
  };
}

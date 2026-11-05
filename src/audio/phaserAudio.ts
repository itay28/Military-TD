import type { AudioOut } from './audioOut';
import type { SoundId } from './sounds';

/** The part of Phaser's sound manager the sink uses. */
export interface SoundManagerLike {
  /** True until the browser lets the page play audio (after the first input). */
  readonly locked: boolean;
  play(key: string, config: { readonly volume: number }): unknown;
}

/** The audio cache key a sound loads under. */
export function soundKey(id: SoundId): string {
  return `sound:${id}`;
}

/**
 * Plays sounds through Phaser at `volume()` (0–1, the SFX channel of the mix, #67), read at each play. Silent at volume
 * 0, while audio is locked (so nothing bursts out at the first input), for a sound whose file didn't load (`isLoaded`
 * false), and on any playback error: sound never breaks the game.
 */
export function createPhaserAudio(
  sound: SoundManagerLike,
  isLoaded: (key: string) => boolean,
  volume: () => number,
): AudioOut {
  return {
    play(id, gain = 1) {
      const key = soundKey(id);
      const level = volume();
      if (level <= 0 || sound.locked || !isLoaded(key)) return;
      try {
        sound.play(key, { volume: level * gain });
      } catch {
        // A blocked or undecodable file: stay silent.
      }
    },
  };
}

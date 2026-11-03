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
 * Plays sounds through Phaser. Silent while audio is locked (so nothing bursts out at the first input), for a sound whose
 * file didn't load (`isLoaded` false), and on any playback error: sound never breaks the game.
 */
export function createPhaserAudio(sound: SoundManagerLike, isLoaded: (key: string) => boolean): AudioOut {
  return {
    play(id, volume = 1) {
      const key = soundKey(id);
      if (sound.locked || !isLoaded(key)) return;
      try {
        sound.play(key, { volume });
      } catch {
        // A blocked or undecodable file: stay silent.
      }
    },
  };
}

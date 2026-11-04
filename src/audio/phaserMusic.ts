import type { MusicBackend, MusicVoice, TrackId } from './music';

/** The audio cache key of a music track. */
export const musicKey = (track: TrackId): string => `music-${track}`;

/** The part of a Phaser sound this uses (WebAudio and HTML5 sounds both have it). */
export interface LoopingSound {
  volume: number;
  play(): boolean;
  stop(): boolean;
  destroy(): void;
}

/** The part of Phaser this needs, so tests can fake it: the sound manager, the audio cache and a repeating timer. */
export interface PhaserMusicDeps {
  /** Phaser's `game.sound.add`. */
  add(key: string, config: { loop: boolean; volume: number }): LoopingSound;
  /** Phaser's `game.cache.audio.exists`: false when the file failed to load or wasn't loaded (test mode). */
  has(key: string): boolean;
  /** Milliseconds, for the fades (`performance.now` in the game). */
  now(): number;
  /** Calls `tick` every frame or so until the returned function is called. */
  every(tick: () => void): () => void;
}

/** The volume `elapsedMs` into a linear fade from `from` to `to` that lasts `ms`. */
export function rampVolume(from: number, to: number, elapsedMs: number, ms: number): number {
  if (ms <= 0 || elapsedMs >= ms) return to;
  return from + (to - from) * Math.max(0, elapsedMs / ms);
}

/** The music backend on Phaser's sound manager. Any failure leaves that track silent, never the game broken. */
export function createPhaserMusicBackend(deps: PhaserMusicDeps): MusicBackend {
  return {
    start(track) {
      const key = musicKey(track);
      if (!deps.has(key)) return null;
      const sound = deps.add(key, { loop: true, volume: 0 });
      sound.play();
      return phaserVoice(sound, deps);
    },
  };
}

function phaserVoice(sound: LoopingSound, deps: PhaserMusicDeps): MusicVoice {
  let cancel: (() => void) | null = null;
  let stopped = false;
  const clear = (): void => {
    cancel?.();
    cancel = null;
  };
  return {
    fadeTo(volume, ms, onDone) {
      if (stopped) return;
      clear();
      const from = sound.volume;
      const startedAt = deps.now();
      const tick = (): void => {
        const elapsed = deps.now() - startedAt;
        sound.volume = rampVolume(from, volume, elapsed, ms);
        if (elapsed >= ms) {
          clear();
          onDone?.();
        }
      };
      cancel = deps.every(tick);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clear();
      sound.stop();
      sound.destroy();
    },
  };
}

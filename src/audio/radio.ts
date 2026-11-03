import type { AudioOut } from './audioOut';
import type { SoundId } from './sounds';

/** Where `main.ts` keeps the music controller in the game registry, for the Game scene's radio cues. */
export const MUSIC_REGISTRY_KEY = 'music';

/** The part of the music controller a radio cue needs (#396). */
export interface MusicDuck {
  setDucked(on: boolean): void;
}

/**
 * Wraps `sink` so the music ducks while a radio cue (wave start, victory, defeat) plays, and comes back up once the
 * last cue playing ends. `cueMs` is each radio cue's length; other sounds pass straight through. `schedule` runs a
 * callback after some ms (the scene's clock in the game, a fake in tests).
 */
export function duckForRadio(
  sink: AudioOut,
  music: MusicDuck,
  cueMs: Partial<Record<SoundId, number>>,
  schedule: (ms: number, run: () => void) => void,
): AudioOut {
  let playing = 0;
  return {
    play(id) {
      sink.play(id);
      const ms = cueMs[id];
      if (ms === undefined) return;
      if (playing++ === 0) music.setDucked(true);
      schedule(ms, () => {
        if (--playing === 0) music.setDucked(false);
      });
    },
  };
}

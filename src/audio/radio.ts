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
 * callback after some ms and returns a way to cancel it (a real-time timer in the game, a fake in tests).
 */
export function duckForRadio(
  sink: AudioOut,
  music: MusicDuck,
  cueMs: Partial<Record<SoundId, number>>,
  schedule: (ms: number, run: () => void) => () => void,
): AudioOut & { dispose(): void } {
  let playing = 0;
  const cancels = new Set<() => void>();
  return {
    /** Cancels the pending releases and lifts the duck, so a dead scene's timer can't touch a new scene's cue. */
    dispose() {
      for (const cancel of cancels) cancel();
      cancels.clear();
      if (playing > 0) music.setDucked(false);
      playing = 0;
    },
    play(id) {
      sink.play(id);
      const ms = cueMs[id];
      if (ms === undefined) return;
      if (playing++ === 0) music.setDucked(true);
      const cancel = schedule(ms, () => {
        cancels.delete(cancel);
        if (--playing === 0) music.setDucked(false);
      });
      cancels.add(cancel);
    },
  };
}

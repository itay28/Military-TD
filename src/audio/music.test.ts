import { describe, expect, it } from 'vitest';
import {
  createMusicController,
  trackFor,
  TRACK_VOLUME,
  type MusicBackend,
  type MusicVoice,
  type TrackId,
} from './music';

interface FakeVoice extends MusicVoice {
  readonly track: TrackId;
  readonly fades: { volume: number; ms: number }[];
  stopped: boolean;
  /** Finishes the last fade, as the real backend's timer would. */
  finishFade(): void;
}

/** Records every voice it starts; `missing` tracks act like a file that failed to load. */
function fakeBackend(missing: readonly TrackId[] = []) {
  const voices: FakeVoice[] = [];
  const backend: MusicBackend = {
    start(track) {
      if (missing.includes(track)) return null;
      let onDone: (() => void) | undefined;
      const voice: FakeVoice = {
        track,
        fades: [],
        stopped: false,
        fadeTo(volume, ms, done) {
          voice.fades.push({ volume, ms });
          onDone = done;
        },
        stop() {
          voice.stopped = true;
        },
        finishFade() {
          const done = onDone;
          onDone = undefined;
          done?.();
        },
      };
      voices.push(voice);
      return voice;
    },
  };
  return { backend, voices };
}

describe('trackFor', () => {
  it('plays the menu track on the menus and the game track in the Game', () => {
    expect(trackFor('Menu')).toBe('menu');
    expect(trackFor('LevelSelect')).toBe('menu');
    expect(trackFor('Game')).toBe('game');
  });

  it('is silent on Boot and on a scene it does not know', () => {
    expect(trackFor('Boot')).toBeNull();
    expect(trackFor('Nowhere')).toBeNull();
  });
});

describe('createMusicController', () => {
  it('plays the menu track quieter than full volume (maintainer feedback on #334)', () => {
    expect(TRACK_VOLUME.menu).toBeLessThan(1);
    expect(TRACK_VOLUME.menu).toBeGreaterThan(0);
  });

  it('plays nothing before the first input, then fades the current track in', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.enterScene('Menu');
    expect(voices).toHaveLength(0);

    music.unlock();
    expect(voices.map((v) => v.track)).toEqual(['menu']);
    expect(voices[0]?.fades).toEqual([{ volume: TRACK_VOLUME.menu, ms: 1000 }]);
  });

  it('keeps the track playing when the next scene has the same one', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('Menu');
    music.enterScene('LevelSelect');
    music.enterScene('Menu');
    expect(voices).toHaveLength(1);
    expect(voices[0]?.fades).toHaveLength(1);
    expect(voices[0]?.stopped).toBe(false);
  });

  it('keeps the game track through a restart (the End screen is part of the Game)', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('Game');
    music.enterScene('Game');
    expect(voices.map((v) => v.track)).toEqual(['game']);
  });

  it('crossfades over about a second to a different track', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('LevelSelect');
    music.enterScene('Game');

    const [menu, game] = voices;
    expect(game?.track).toBe('game');
    expect(menu?.fades.at(-1)).toEqual({ volume: 0, ms: 1000 });
    expect(game?.fades).toEqual([{ volume: TRACK_VOLUME.game, ms: 1000 }]);
    expect(menu?.stopped).toBe(false);
    menu?.finishFade();
    expect(menu?.stopped).toBe(true);
  });

  it('fades out on a scene with no track', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('Menu');
    music.enterScene('Boot');
    expect(voices[0]?.fades.at(-1)).toEqual({ volume: 0, ms: 1000 });
    expect(voices).toHaveLength(1);
  });

  it('starts a fresh voice when going back to a track that is still fading out', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('Menu');
    music.enterScene('Game');
    music.enterScene('Menu');

    expect(voices.map((v) => v.track)).toEqual(['menu', 'game', 'menu']);
    const [oldMenu, game, newMenu] = voices;
    expect(game?.fades.at(-1)).toEqual({ volume: 0, ms: 1000 });
    expect(newMenu?.fades).toEqual([{ volume: TRACK_VOLUME.menu, ms: 1000 }]);
    oldMenu?.finishFade();
    game?.finishFade();
    expect(oldMenu?.stopped).toBe(true);
    expect(game?.stopped).toBe(true);
    expect(newMenu?.stopped).toBe(false);
  });

  it('stays silent for a track whose file is missing, and carries on afterwards', () => {
    const { backend, voices } = fakeBackend(['game']);
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('Menu');
    expect(() => music.enterScene('Game')).not.toThrow();
    music.enterScene('Menu');
    expect(voices.map((v) => v.track)).toEqual(['menu', 'menu']);
  });

  it('never touches the backend when muted (test mode)', () => {
    let calls = 0;
    const music = createMusicController(
      {
        start: () => {
          calls++;
          return null;
        },
      },
      { muted: true },
    );
    music.unlock();
    music.enterScene('Menu');
    music.enterScene('Game');
    expect(calls).toBe(0);
  });

  it('uses the crossfade length it is given', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false, crossfadeMs: 250 });
    music.unlock();
    music.enterScene('Game');
    expect(voices[0]?.fades).toEqual([{ volume: TRACK_VOLUME.game, ms: 250 }]);
  });

  it('unlocks only once', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.enterScene('Menu');
    music.unlock();
    music.unlock();
    expect(voices).toHaveLength(1);
  });
});

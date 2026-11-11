import { describe, expect, it } from 'vitest';
import { createRecordingAudio } from './audioOut';
import {
  createMusicController,
  CROSSFADE_MS,
  DUCK_FADE_MS,
  DUCK_VOLUME,
  END_SCREEN,
  gameMusic,
  LAYER_FADE_MS,
  TRACK_CHANNEL,
  trackFor,
  TRACK_VOLUME,
  VOLUME_RAMP_MS,
  type MusicBackend,
  type MusicVoice,
  type TrackId,
} from './music';
import type { Channel } from './volume';

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
  it('plays the menu track on the menus, the ambient bed in the Game and the game track on the End screen (#405)', () => {
    expect(trackFor('Menu')).toBe('menu');
    expect(trackFor('LevelSelect')).toBe('menu');
    expect(trackFor('Game')).toBe('ambient');
    expect(trackFor(END_SCREEN)).toBe('game');
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

  it('keeps the ambient bed and its layer through a second start of the Game', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('Game');
    music.enterScene('Game');
    expect(voices.map((v) => v.track)).toEqual(['ambient', 'combat']);
  });

  it('crossfades over about a second to a different track', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('LevelSelect');
    music.enterScene('End');

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
    music.enterScene('End');
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
    expect(() => music.enterScene('End')).not.toThrow();
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
    music.enterScene('End');
    expect(calls).toBe(0);
  });

  it('uses the crossfade length it is given', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false, crossfadeMs: 250 });
    music.unlock();
    music.enterScene('End');
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

  it('fades a new track in to the channel volume times the own level of the track', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false, volume: () => 0.48 });
    music.enterScene('Menu');
    music.unlock();
    expect(voices[0]!.fades).toEqual([{ volume: 0.48 * TRACK_VOLUME.menu, ms: 1000 }]);
  });

  it('ramps the playing track to the new volume on refreshVolume', () => {
    const { backend, voices } = fakeBackend();
    let volume = 0.5;
    const music = createMusicController(backend, { muted: false, volume: () => volume });
    music.enterScene('Menu');
    music.unlock();
    volume = 0;
    music.refreshVolume();
    expect(voices[0]!.fades.at(-1)).toEqual({ volume: 0, ms: VOLUME_RAMP_MS });
    volume = 0.3;
    music.refreshVolume();
    expect(voices[0]!.fades.at(-1)).toEqual({ volume: 0.3 * TRACK_VOLUME.menu, ms: VOLUME_RAMP_MS });
    expect(voices).toHaveLength(1);
  });

  it('leaves a track that is fading out alone on refreshVolume', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false, volume: () => 0.5 });
    music.enterScene('Menu');
    music.unlock();
    music.enterScene('End');
    music.refreshVolume();
    expect(voices[0]!.fades).toEqual([
      { volume: 0.5 * TRACK_VOLUME.menu, ms: 1000 },
      { volume: 0, ms: 1000 },
    ]);
    expect(voices[1]!.fades.at(-1)).toEqual({ volume: 0.5 * TRACK_VOLUME.game, ms: VOLUME_RAMP_MS });
  });

  it('does nothing on refreshVolume before the first input, when muted, or with nothing playing', () => {
    const { backend, voices } = fakeBackend();
    const locked = createMusicController(backend, { muted: false, volume: () => 0.5 });
    locked.enterScene('Menu');
    locked.refreshVolume();
    const muted = createMusicController(backend, { muted: true, volume: () => 0.5 });
    muted.enterScene('Menu');
    muted.unlock();
    muted.refreshVolume();
    const silent = createMusicController(backend, { muted: false });
    silent.enterScene('Boot');
    silent.unlock();
    expect(() => silent.refreshVolume()).not.toThrow();
    expect(voices).toEqual([]);
  });
});

describe('ducking (#396)', () => {
  it('drops the playing track to the duck volume, then brings it back', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('End');
    music.setDucked(true);
    expect(DUCK_VOLUME).toBeCloseTo(0.4);
    expect(voices[0]?.fades.at(-1)).toEqual({ volume: DUCK_VOLUME, ms: DUCK_FADE_MS });
    music.setDucked(false);
    expect(voices[0]?.fades.at(-1)).toEqual({ volume: 1, ms: DUCK_FADE_MS });
  });

  it('does nothing when the duck state does not change', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('End');
    const before = voices[0]?.fades.length;
    music.setDucked(false);
    expect(voices[0]?.fades.length).toBe(before);
  });

  it('fades a track that starts while ducked in to the duck volume', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('Menu');
    music.setDucked(true);
    music.enterScene('End');
    expect(voices[1]?.fades).toEqual([{ volume: DUCK_VOLUME, ms: 1000 }]);
  });

  it('does not bring a fading-out track back up when the duck ends', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false });
    music.unlock();
    music.enterScene('End');
    music.setDucked(true);
    music.enterScene('Boot');
    const before = voices[0]?.fades.length;
    music.setDucked(false);
    expect(voices[0]?.fades.length).toBe(before);
  });

  it('is safe with nothing playing, before the first input, and when muted', () => {
    const { backend, voices } = fakeBackend(['game']);
    const locked = createMusicController(backend, { muted: false });
    locked.enterScene('Menu');
    locked.setDucked(true);
    const muted = createMusicController(backend, { muted: true });
    muted.unlock();
    muted.enterScene('Menu');
    muted.setDucked(true);
    const missing = createMusicController(backend, { muted: false });
    missing.unlock();
    missing.enterScene('End');
    expect(() => missing.setDucked(true)).not.toThrow();
    expect(voices).toHaveLength(0);
  });
});

describe('the battlefield ambience (#405)', () => {
  /** The SFX channel at 0.5, music at 0.8, so a test can tell which one a track reads. */
  const volume = (channel: Channel): number => (channel === 'sfx' ? 0.5 : 0.8);

  function inGame(missing: readonly TrackId[] = []) {
    const { backend, voices } = fakeBackend(missing);
    const music = createMusicController(backend, { muted: false, volume });
    music.unlock();
    music.enterScene('Game');
    return { music, voices, bed: voices[0]!, layer: voices[1]! };
  }

  it('counts the ambience as sound effects and the tracks as music', () => {
    expect(TRACK_CHANNEL).toEqual({ menu: 'music', game: 'music', ambient: 'sfx', combat: 'sfx' });
  });

  it('fades the bed in at the SFX volume and starts its combat layer silent (the Build phase)', () => {
    const { voices, bed, layer } = inGame();
    expect(voices.map((v) => v.track)).toEqual(['ambient', 'combat']);
    expect(bed.fades).toEqual([{ volume: 0.5 * TRACK_VOLUME.ambient, ms: 1000 }]);
    expect(layer.fades).toEqual([{ volume: 0, ms: 1000 }]);
  });

  it('fades the combat layer up during a wave and back down after it', () => {
    const { music, bed, layer } = inGame();
    music.setCombat(true);
    expect(layer.fades.at(-1)).toEqual({ volume: 0.5 * TRACK_VOLUME.combat, ms: LAYER_FADE_MS });
    music.setCombat(true);
    expect(layer.fades).toHaveLength(2);
    music.setCombat(false);
    expect(layer.fades.at(-1)).toEqual({ volume: 0, ms: LAYER_FADE_MS });
    expect(bed.fades).toHaveLength(1);
  });

  it('starts the layer loud when a wave is already on as the bed starts', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: false, volume });
    music.setCombat(true);
    music.enterScene('Game');
    music.unlock();
    expect(voices[1]?.fades).toEqual([{ volume: 0.5 * TRACK_VOLUME.combat, ms: 1000 }]);
  });

  it('crossfades the bed and its layer to the game track on the End screen', () => {
    const { music, voices, bed, layer } = inGame();
    music.setCombat(true);
    music.enterScene(END_SCREEN);
    expect(voices[2]?.track).toBe('game');
    expect(voices[2]?.fades).toEqual([{ volume: 0.8 * TRACK_VOLUME.game, ms: 1000 }]);
    expect(bed.fades.at(-1)).toEqual({ volume: 0, ms: 1000 });
    expect(layer.fades.at(-1)).toEqual({ volume: 0, ms: 1000 });
    bed.finishFade();
    layer.finishFade();
    expect(bed.stopped && layer.stopped).toBe(true);
    // A wave flag left over does nothing to the game track, which has no layer.
    music.setCombat(false);
    expect(voices).toHaveLength(3);
  });

  it('ducks the layer with the bed, and ramps both on refreshVolume', () => {
    const { music, bed, layer } = inGame();
    music.setCombat(true);
    music.setDucked(true);
    expect(bed.fades.at(-1)).toEqual({ volume: 0.5 * TRACK_VOLUME.ambient * DUCK_VOLUME, ms: DUCK_FADE_MS });
    expect(layer.fades.at(-1)).toEqual({ volume: 0.5 * TRACK_VOLUME.combat * DUCK_VOLUME, ms: DUCK_FADE_MS });
    music.setDucked(false);
    music.refreshVolume();
    expect(bed.fades.at(-1)).toEqual({ volume: 0.5 * TRACK_VOLUME.ambient, ms: VOLUME_RAMP_MS });
    expect(layer.fades.at(-1)).toEqual({ volume: 0.5 * TRACK_VOLUME.combat, ms: VOLUME_RAMP_MS });
  });

  it('keeps the bed when the layer file is missing, and the layer when the bed is', () => {
    const noLayer = inGame(['combat']);
    expect(noLayer.voices.map((v) => v.track)).toEqual(['ambient']);
    expect(() => noLayer.music.setCombat(true)).not.toThrow();
    const noBed = inGame(['ambient']);
    expect(noBed.voices.map((v) => v.track)).toEqual(['combat']);
  });

  it('never touches the backend when muted (test mode)', () => {
    const { backend, voices } = fakeBackend();
    const music = createMusicController(backend, { muted: true });
    music.unlock();
    music.enterScene('Game');
    music.setCombat(true);
    music.enterScene(END_SCREEN);
    expect(voices).toEqual([]);
  });
});

describe('gameMusic', () => {
  it('plays the layer during a wave, and the End screen once the game is over', () => {
    expect(gameMusic('build')).toEqual({ scene: 'Game', combat: false });
    expect(gameMusic('wave')).toEqual({ scene: 'Game', combat: true });
    expect(gameMusic('victory')).toEqual({ scene: END_SCREEN, combat: false });
    expect(gameMusic('defeat')).toEqual({ scene: END_SCREEN, combat: false });
  });
});

describe('the radio cold open (#479)', () => {
  const CUE_MS = 2680;

  /** A controller with a cold open on a recording sink and a fake timer: `elapse()` runs what's due. */
  function withColdOpen(muted = false) {
    const { backend, voices } = fakeBackend();
    const audio = createRecordingAudio();
    const timers: { ms: number; run: () => void }[] = [];
    const music = createMusicController(backend, {
      muted,
      coldOpen: { audio, ms: CUE_MS, schedule: (ms, run) => void timers.push({ ms, run }) },
    });
    const elapse = (): void => {
      for (const timer of timers.splice(0)) timer.run();
    };
    return { music, voices, audio, timers, elapse };
  }

  it('plays the cold open on the first input at the Menu, then fades the menu track in once it ends', () => {
    const { music, voices, audio, timers, elapse } = withColdOpen();
    music.enterScene('Menu');
    expect(audio.played).toEqual([]);

    music.unlock();
    expect(audio.played).toEqual(['coldOpen']);
    expect(voices).toEqual([]);
    expect(timers.map((t) => t.ms)).toEqual([CUE_MS]);

    elapse();
    expect(voices.map((v) => v.track)).toEqual(['menu']);
    expect(voices[0]?.fades).toEqual([{ volume: TRACK_VOLUME.menu, ms: CROSSFADE_MS }]);
    expect(audio.played).toEqual(['coldOpen']);
  });

  it('plays it once a session: later visits to the menu go straight to music', () => {
    const { music, voices, audio, elapse } = withColdOpen();
    music.enterScene('Menu');
    music.unlock();
    elapse();
    music.enterScene('Game');
    music.enterScene('Menu');
    expect(audio.played).toEqual(['coldOpen']);
    expect(voices.map((v) => v.track)).toEqual(['menu', 'ambient', 'combat', 'menu']);
  });

  it('waits for the menu when the first input comes on a scene with no track (Boot)', () => {
    const { music, voices, audio, elapse } = withColdOpen();
    music.enterScene('Boot');
    music.unlock();
    expect(audio.played).toEqual([]);

    music.enterScene('Menu');
    expect(audio.played).toEqual(['coldOpen']);
    expect(voices).toEqual([]);
    elapse();
    expect(voices.map((v) => v.track)).toEqual(['menu']);
  });

  it('skips it when the first track is not the menu one, and later on the menu too', () => {
    const { music, voices, audio } = withColdOpen();
    music.enterScene('Game');
    music.unlock();
    music.enterScene('Menu');
    expect(audio.played).toEqual([]);
    expect(voices.map((v) => v.track)).toEqual(['ambient', 'combat', 'menu']);
  });

  it('plays the track the current scene wants once the cue ends, after a scene change during it', () => {
    const { music, voices, elapse } = withColdOpen();
    music.enterScene('Menu');
    music.unlock();
    music.enterScene('Game');
    expect(voices).toEqual([]);
    elapse();
    expect(voices.map((v) => v.track)).toEqual(['ambient', 'combat']);
  });

  it('plays neither the cue nor the music when muted (test mode)', () => {
    const { music, voices, audio, timers } = withColdOpen(true);
    music.enterScene('Menu');
    music.unlock();
    expect(audio.played).toEqual([]);
    expect(timers).toEqual([]);
    expect(voices).toEqual([]);
  });
});

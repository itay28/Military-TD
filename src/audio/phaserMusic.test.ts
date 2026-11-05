import { describe, expect, it } from 'vitest';
import { createPhaserMusicBackend, musicKey, rampVolume, type LoopingSound } from './phaserMusic';

function fakePhaser(loaded: readonly string[]) {
  let time = 0;
  let ticks: (() => void)[] = [];
  const sounds: (LoopingSound & { key: string; loop: boolean; playing: boolean; destroyed: boolean })[] = [];
  const backend = createPhaserMusicBackend({
    add(key, config) {
      const sound = {
        key,
        loop: config.loop,
        volume: config.volume,
        playing: false,
        destroyed: false,
        play: () => (sound.playing = true),
        stop: () => !(sound.playing = false),
        destroy: () => void (sound.destroyed = true),
      };
      sounds.push(sound);
      return sound;
    },
    has: (key) => loaded.includes(key),
    now: () => time,
    every(tick) {
      ticks.push(tick);
      return () => (ticks = ticks.filter((t) => t !== tick));
    },
  });
  const advance = (ms: number): void => {
    time += ms;
    for (const tick of [...ticks]) tick();
  };
  return { backend, sounds, advance, ticking: () => ticks.length };
}

describe('rampVolume', () => {
  it('moves linearly from one volume to the other', () => {
    expect(rampVolume(0, 1, 0, 1000)).toBe(0);
    expect(rampVolume(0, 1, 250, 1000)).toBe(0.25);
    expect(rampVolume(1, 0, 500, 1000)).toBe(0.5);
    expect(rampVolume(0, 1, 1500, 1000)).toBe(1);
    expect(rampVolume(0.3, 1, 0, 0)).toBe(1);
  });
});

describe('createPhaserMusicBackend', () => {
  it('returns no voice for a track whose file is not loaded', () => {
    const { backend, sounds } = fakePhaser([]);
    expect(backend.start('menu')).toBeNull();
    expect(sounds).toHaveLength(0);
  });

  it('starts a loaded track looping at volume 0', () => {
    const { backend, sounds } = fakePhaser([musicKey('menu')]);
    expect(backend.start('menu')).not.toBeNull();
    expect(sounds[0]).toMatchObject({ key: 'music-menu', loop: true, volume: 0, playing: true });
  });

  it('fades the volume, then calls back and stops ticking', () => {
    const { backend, sounds, advance, ticking } = fakePhaser([musicKey('game')]);
    const voice = backend.start('game');
    let done = false;
    voice?.fadeTo(1, 1000, () => (done = true));
    advance(500);
    expect(sounds[0]?.volume).toBe(0.5);
    expect(done).toBe(false);
    advance(500);
    expect(sounds[0]?.volume).toBe(1);
    expect(done).toBe(true);
    expect(ticking()).toBe(0);
  });

  it('stops and frees the sound, and ignores fades after that', () => {
    const { backend, sounds, ticking } = fakePhaser([musicKey('game')]);
    const voice = backend.start('game');
    voice?.fadeTo(1, 1000);
    voice?.stop();
    voice?.fadeTo(1, 1000);
    expect(sounds[0]).toMatchObject({ playing: false, destroyed: true });
    expect(ticking()).toBe(0);
  });
});

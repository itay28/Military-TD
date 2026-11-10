import { describe, expect, it } from 'vitest';
import { createPhaserAudio, soundKey, type SoundManagerLike } from './phaserAudio';

function manager(over: Partial<SoundManagerLike> = {}): SoundManagerLike & { plays: string[]; volumes: number[] } {
  const plays: string[] = [];
  const volumes: number[] = [];
  return {
    locked: false,
    plays,
    volumes,
    play: (key, config) => {
      plays.push(key);
      volumes.push(config.volume);
    },
    ...over,
  };
}
const full = () => 1;

describe('createPhaserAudio', () => {
  it('plays a loaded sound by its cache key', () => {
    const sound = manager();
    createPhaserAudio(sound, () => true, full).play('missileLaunch');
    expect(sound.plays).toEqual([soundKey('missileLaunch')]);
  });

  it('stays silent until the browser unlocks audio (the first input)', () => {
    const sound = manager({ locked: true });
    createPhaserAudio(sound, () => true, full).play('missileLaunch');
    expect(sound.plays).toEqual([]);
  });

  it('stays silent for a sound whose file did not load', () => {
    const sound = manager();
    createPhaserAudio(sound, (key) => key !== soundKey('leak'), full).play('leak');
    expect(sound.plays).toEqual([]);
  });

  it('never lets a playback error reach the game', () => {
    const sound = manager({
      play: () => {
        throw new Error('decode failed');
      },
    });
    expect(() => createPhaserAudio(sound, () => true, full).play('victory')).not.toThrow();
  });

  it('plays at the effective SFX volume, read at each play', () => {
    const sound = manager();
    let volume = 0.64;
    const audio = createPhaserAudio(
      sound,
      () => true,
      () => volume,
    );
    audio.play('missileLaunch');
    volume = 0.2;
    audio.play('leak');
    expect(sound.volumes).toEqual([0.64, 0.2]);
  });

  it('does not play at all at volume 0', () => {
    const sound = manager();
    createPhaserAudio(
      sound,
      () => true,
      () => 0,
    ).play('missileLaunch');
    expect(sound.plays).toEqual([]);
  });

  it('plays at the volume it is given, full by default (#404)', () => {
    const sound = manager();
    const audio = createPhaserAudio(sound, () => true, full);
    audio.play('mortarBlast', 0.25);
    audio.play('rifleShot');
    expect(sound.volumes).toEqual([0.25, 1]);
  });
});

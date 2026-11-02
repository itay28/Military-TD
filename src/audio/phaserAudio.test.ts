import { describe, expect, it } from 'vitest';
import { createPhaserAudio, soundKey, type SoundManagerLike } from './phaserAudio';

function manager(over: Partial<SoundManagerLike> = {}): SoundManagerLike & { plays: string[] } {
  const plays: string[] = [];
  return { locked: false, plays, play: (key) => plays.push(key), ...over };
}

describe('createPhaserAudio', () => {
  it("plays a loaded sound by its cache key", () => {
    const sound = manager();
    createPhaserAudio(sound, () => true).play('cannonShot');
    expect(sound.plays).toEqual([soundKey('cannonShot')]);
  });

  it('stays silent until the browser unlocks audio (the first input)', () => {
    const sound = manager({ locked: true });
    createPhaserAudio(sound, () => true).play('cannonShot');
    expect(sound.plays).toEqual([]);
  });

  it('stays silent for a sound whose file did not load', () => {
    const sound = manager();
    createPhaserAudio(sound, (key) => key !== soundKey('leak')).play('leak');
    expect(sound.plays).toEqual([]);
  });

  it('never lets a playback error reach the game', () => {
    const sound = manager({
      play: () => {
        throw new Error('decode failed');
      },
    });
    expect(() => createPhaserAudio(sound, () => true).play('victory')).not.toThrow();
  });
});

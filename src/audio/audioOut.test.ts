import { describe, expect, it } from 'vitest';
import { createRecordingAudio, silentAudio, throttleAudio } from './audioOut';

function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('createRecordingAudio', () => {
  it('records each play in order', () => {
    const audio = createRecordingAudio();
    audio.play('rifleShot');
    audio.play('leak');
    expect(audio.played).toEqual(['rifleShot', 'leak']);
  });
});

describe('silentAudio', () => {
  it('plays nothing and never throws', () => {
    expect(() => silentAudio.play('victory')).not.toThrow();
  });
});

describe('throttleAudio', () => {
  it('lets at most maxPlays of one sound through per window', () => {
    const sink = createRecordingAudio();
    const audio = throttleAudio(sink, { maxPlays: 3, windowMs: 100 }, clock().now);
    for (let i = 0; i < 10; i++) audio.play('rifleShot');
    expect(sink.played).toEqual(['rifleShot', 'rifleShot', 'rifleShot']);
  });

  it('plays the sound again once the window has passed', () => {
    const sink = createRecordingAudio();
    const time = clock();
    const audio = throttleAudio(sink, { maxPlays: 2, windowMs: 100 }, time.now);
    audio.play('rifleShot');
    audio.play('rifleShot');
    audio.play('rifleShot');
    time.advance(100);
    audio.play('rifleShot');
    expect(sink.played).toHaveLength(3);
  });

  it('counts the window from each play, so a steady stream keeps its rate', () => {
    const sink = createRecordingAudio();
    const time = clock();
    const audio = throttleAudio(sink, { maxPlays: 2, windowMs: 100 }, time.now);
    audio.play('aaGunShot'); // t=0
    time.advance(60);
    audio.play('aaGunShot'); // t=60
    time.advance(50);
    audio.play('aaGunShot'); // t=110: the t=0 play has left the window
    audio.play('aaGunShot'); // still two in (10, 110]
    expect(sink.played).toHaveLength(3);
  });

  it('throttles each sound on its own', () => {
    const sink = createRecordingAudio();
    const audio = throttleAudio(sink, { maxPlays: 1, windowMs: 100 }, clock().now);
    audio.play('rifleShot');
    audio.play('rifleShot');
    audio.play('shellExplosion');
    audio.play('waveStart');
    expect(sink.played).toEqual(['rifleShot', 'shellExplosion', 'waveStart']);
  });
});

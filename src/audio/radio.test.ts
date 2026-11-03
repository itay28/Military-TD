import { describe, expect, it } from 'vitest';
import { createRecordingAudio } from './audioOut';
import { duckForRadio, type MusicDuck } from './radio';
import type { SoundId } from './sounds';

/** A music fake that records each duck change, and a schedule fake the test runs by hand. */
function setup(cueMs: Partial<Record<SoundId, number>> = { waveStart: 2000, victory: 3000 }) {
  const sink = createRecordingAudio();
  const ducked: boolean[] = [];
  const music: MusicDuck = { setDucked: (on) => ducked.push(on) };
  let now = 0;
  const timers: { at: number; run: () => void }[] = [];
  const schedule = (ms: number, run: () => void): void => {
    timers.push({ at: now + ms, run });
  };
  const advance = (ms: number): void => {
    now += ms;
    for (const timer of timers.filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.run();
    }
  };
  const audio = duckForRadio(sink, music, cueMs, schedule);
  return { audio, sink, ducked, advance };
}

describe('duckForRadio', () => {
  it('ducks the music while a radio cue plays, then lets it back up', () => {
    const { audio, sink, ducked, advance } = setup();
    audio.play('waveStart');
    expect(sink.played).toEqual(['waveStart']);
    expect(ducked).toEqual([true]);
    advance(1999);
    expect(ducked).toEqual([true]);
    advance(1);
    expect(ducked).toEqual([true, false]);
  });

  it('leaves the music alone for a sound that is not a radio cue', () => {
    const { audio, sink, ducked } = setup();
    audio.play('rifleShot');
    expect(sink.played).toEqual(['rifleShot']);
    expect(ducked).toEqual([]);
  });

  it('keeps the music ducked until the last of two overlapping cues ends', () => {
    const { audio, ducked, advance } = setup();
    audio.play('waveStart');
    advance(1000);
    audio.play('victory');
    advance(1000);
    expect(ducked).toEqual([true]);
    advance(2000);
    expect(ducked).toEqual([true, false]);
  });

  it('ducks again for a cue after the last one ended', () => {
    const { audio, ducked, advance } = setup();
    audio.play('waveStart');
    advance(2000);
    audio.play('waveStart');
    expect(ducked).toEqual([true, false, true]);
  });
});

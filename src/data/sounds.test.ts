import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SOUND_IDS } from '../audio/sounds';
import { RADIO_CUE_MS, SOUND_URLS } from './sounds';

/** An Ogg Vorbis file's length in ms: the last page's granule position over the sample rate in the id header. */
function oggDurationMs(path: string): number {
  const bytes = readFileSync(path);
  const sampleRate = bytes.readUInt32LE(bytes.indexOf('vorbis', 0, 'latin1') + 6 + 4 + 1);
  const lastPage = bytes.lastIndexOf('OggS', bytes.length, 'latin1');
  const granule = Number(bytes.readBigInt64LE(lastPage + 6));
  return (granule / sampleRate) * 1000;
}

describe('SOUND_URLS', () => {
  it('has a file for every sound', () => {
    for (const id of SOUND_IDS) expect(SOUND_URLS[id], id).toBeTruthy();
  });
});

describe('RADIO_CUE_MS (#396)', () => {
  it('makes wave start, victory and defeat radio cues', () => {
    expect(Object.keys(RADIO_CUE_MS).sort()).toEqual(['defeat', 'victory', 'waveStart']);
  });

  it("gives each cue its file's length, 1.5–3.5 s", () => {
    for (const [id, ms] of Object.entries(RADIO_CUE_MS)) {
      const fileMs = oggDurationMs(`assets/radio-cues/${id}.ogg`);
      expect(Math.abs(fileMs - ms), id).toBeLessThan(100);
      expect(ms, id).toBeGreaterThanOrEqual(1500);
      expect(ms, id).toBeLessThanOrEqual(3500);
    }
  });
});

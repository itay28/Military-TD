import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../sim/factions';
import { TOWER_STATS, type TowerKind } from './towers';
import { SHOT_SOUND, SOUND_IDS } from '../audio/sounds';
import { RADIO_CUE_MS, SOUND_FALLOFF, SOUND_URLS, WHISTLE_LEAD_MS } from './sounds';

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
    for (const id of SOUND_IDS) expect(SOUND_URLS[id], id).toMatch(/\.ogg$/);
    expect(Object.keys(SOUND_URLS).sort()).toEqual([...SOUND_IDS].sort());
  });

  it('has a file for every tower kind × faction shot', () => {
    for (const kind of Object.keys(TOWER_STATS) as TowerKind[]) {
      for (const faction of FACTIONS) expect(SOUND_URLS[SHOT_SOUND[kind][faction]], `${kind} ${faction}`).toBeTruthy();
    }
  });
});

describe('sound tuning', () => {
  it('whistles about half a second before a shell lands', () => {
    expect(WHISTLE_LEAD_MS).toBe(500);
  });

  it('falls off from full volume near the camera to a quiet floor far away', () => {
    expect(SOUND_FALLOFF.nearTiles).toBeGreaterThan(0);
    expect(SOUND_FALLOFF.farTiles).toBeGreaterThan(SOUND_FALLOFF.nearTiles);
    expect(SOUND_FALLOFF.minVolume).toBeGreaterThan(0);
    expect(SOUND_FALLOFF.minVolume).toBeLessThan(1);
  });
});

describe('RADIO_CUE_MS (#396)', () => {
  it('makes wave start, reinforcements, victory and defeat radio cues', () => {
    expect(Object.keys(RADIO_CUE_MS).sort()).toEqual(['defeat', 'victory', 'waveReinforcements', 'waveStart']);
  });

  it("gives each cue its file's length, 1–3.5 s", () => {
    for (const [id, ms] of Object.entries(RADIO_CUE_MS)) {
      const fileMs = oggDurationMs(`assets/radio-cues/${id}.ogg`);
      expect(Math.abs(fileMs - ms), id).toBeLessThan(100);
      expect(ms, id).toBeGreaterThanOrEqual(1000);
      expect(ms, id).toBeLessThanOrEqual(3500);
    }
  });
});

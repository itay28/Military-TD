import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../sim/factions';
import { TOWER_STATS, type TowerKind } from './towers';
import { SHOT_SOUND, SOUND_IDS } from '../audio/sounds';
import { SOUND_FALLOFF, SOUND_URLS, WHISTLE_LEAD_MS } from './sounds';

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

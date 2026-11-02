import { describe, expect, it } from 'vitest';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import { SOUND_IDS, soundFor } from './sounds';

const KINDS = Object.keys(TOWER_STATS) as TowerKind[];

describe('soundFor', () => {
  it("gives each tower kind's shot its own sound", () => {
    // A shell tower's shot is its launch; a hitscan tower's is its towerFired.
    const shots = KINDS.map((kind) =>
      soundFor('shell' in TOWER_STATS[kind] ? { type: 'shellFired', kind } : { type: 'towerFired', kind }),
    );
    expect(shots).not.toContain(null);
    expect(new Set(shots).size).toBe(KINDS.length);
  });

  it('maps a hitscan shot to its tower kind', () => {
    expect(soundFor({ type: 'towerFired', kind: 'rifleNest' })).toBe('rifleShot');
    expect(soundFor({ type: 'towerFired', kind: 'aaGun' })).toBe('aaGunShot');
    expect(soundFor({ type: 'towerFired', kind: 'cannon' })).toBe('cannonShot');
  });

  it('plays the mortar launch when a shell is fired, and an explosion when it lands', () => {
    expect(soundFor({ type: 'shellFired', kind: 'mortar' })).toBe('mortarLaunch');
    expect(soundFor({ type: 'shellLanded' })).toBe('shellExplosion');
  });

  it('maps deaths, leaks, wave start and the end of the game', () => {
    expect(soundFor({ type: 'enemyKilled' })).toBe('enemyDeath');
    expect(soundFor({ type: 'enemyLeaked' })).toBe('leak');
    expect(soundFor({ type: 'waveStarted' })).toBe('waveStart');
    expect(soundFor({ type: 'victory' })).toBe('victory');
    expect(soundFor({ type: 'defeat' })).toBe('defeat');
  });

  it('is silent for a shot whose tower is gone', () => {
    expect(soundFor({ type: 'towerFired', kind: undefined })).toBeNull();
    expect(soundFor({ type: 'shellFired', kind: undefined })).toBeNull();
  });

  it('only returns known sound ids', () => {
    const all = [...KINDS.map((kind) => soundFor({ type: 'towerFired', kind }))];
    for (const id of all) expect(SOUND_IDS).toContain(id);
  });
});

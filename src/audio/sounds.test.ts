import { describe, expect, it } from 'vitest';
import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import { FACTIONS } from '../sim/factions';
import { SHOT_SOUND, SOUND_IDS, soundFor } from './sounds';

const KINDS = Object.keys(TOWER_STATS) as TowerKind[];
const ENEMIES = Object.keys(ENEMY_STATS) as EnemyKind[];

/** A tower kind's shot event: a shell tower's launch, or a hitscan tower's hit. */
const shotOf = (kind: TowerKind) =>
  'shell' in TOWER_STATS[kind] ? ({ type: 'shellFired', kind } as const) : ({ type: 'towerFired', kind } as const);

describe('SHOT_SOUND', () => {
  it('has a shot sound for every tower kind in every faction', () => {
    for (const kind of KINDS) for (const faction of FACTIONS) expect(SOUND_IDS).toContain(SHOT_SOUND[kind][faction]);
  });

  it("gives each tower kind's shot its own sound within a faction", () => {
    for (const faction of FACTIONS) {
      const shots = KINDS.map((kind) => soundFor(shotOf(kind), faction));
      expect(shots).not.toContain(null);
      expect(new Set(shots).size).toBe(KINDS.length);
    }
  });

  it("follows the defender's anti-tank weapon for the Cannon (ADR-0009)", () => {
    const cannon = (faction: (typeof FACTIONS)[number]) => soundFor({ type: 'towerFired', kind: 'cannon' }, faction);
    expect(cannon('us')).toBe('missileLaunch'); // TOW
    expect(cannon('china')).toBe('missileLaunch'); // HJ-8
    expect(cannon('russia')).toBe('gunReport'); // MT-12
    expect(cannon('insurgents')).toBe('recoillessBlast'); // SPG-9
  });

  it('sounds the same in every faction for the other kinds', () => {
    for (const kind of KINDS.filter((k) => k !== 'cannon')) {
      expect(new Set(FACTIONS.map((faction) => SHOT_SOUND[kind][faction])).size).toBe(1);
    }
    expect(soundFor({ type: 'towerFired', kind: 'rifleNest' }, 'us')).toBe('rifleShot');
    expect(soundFor({ type: 'towerFired', kind: 'aaGun' }, 'russia')).toBe('aaGunBurst');
  });
});

describe('soundFor', () => {
  it('plays the mortar launch, its incoming whistle, then its blast', () => {
    expect(soundFor({ type: 'shellFired', kind: 'mortar' }, 'us')).toBe('mortarLaunch');
    expect(soundFor({ type: 'shellIncoming' }, 'us')).toBe('mortarWhistle');
    expect(soundFor({ type: 'shellLanded' }, 'us')).toBe('mortarBlast');
  });

  it('blows up a vehicle heavier than it hits infantry', () => {
    expect(soundFor({ type: 'enemyKilled', enemy: 'infantry' }, 'us')).toBe('infantryHit');
    for (const enemy of ENEMIES.filter((e) => e !== 'infantry')) {
      expect(soundFor({ type: 'enemyKilled', enemy }, 'china')).toBe('vehicleExplosion');
    }
  });

  it('maps leaks, wave start and the end of the game', () => {
    expect(soundFor({ type: 'enemyLeaked' }, 'us')).toBe('leak');
    expect(soundFor({ type: 'waveStarted' }, 'us')).toBe('waveStart');
    expect(soundFor({ type: 'victory' }, 'us')).toBe('victory');
    expect(soundFor({ type: 'defeat' }, 'us')).toBe('defeat');
  });

  it('is silent for a shot whose tower is gone', () => {
    expect(soundFor({ type: 'towerFired', kind: undefined }, 'us')).toBeNull();
    expect(soundFor({ type: 'shellFired', kind: undefined }, 'us')).toBeNull();
  });
});

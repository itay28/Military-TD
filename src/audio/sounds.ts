import type { EnemyKind } from '../data/enemies';
import type { TowerKind } from '../data/towers';
import type { Faction } from '../sim/factions';

/** Every sound the game plays. Each has a file in `src/data/sounds.ts`. */
export const SOUND_IDS = [
  'rifleShot',
  'aaGunBurst',
  'missileLaunch',
  'gunReport',
  'recoillessBlast',
  'mortarLaunch',
  'mortarWhistle',
  'mortarBlast',
  'vehicleExplosion',
  'infantryHit',
  'leak',
  'waveStart',
  'waveReinforcements',
  'victory',
  'defeat',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

/** The same sound in every Faction. */
const everyFaction = (id: SoundId): Record<Faction, SoundId> => ({ us: id, russia: id, china: id, insurgents: id });

/**
 * Each tower kind's shot (a hitscan tower's hit, or a shell tower's launch) in the defender's Faction (ADR-0009). Only the
 * Cannon differs: the TOW (US) and HJ-8 (China) are missiles, the MT-12 (Russia) a gun, the SPG-9 (Insurgents) a
 * recoilless rifle. Adding a kind or a Faction needs a sound here.
 */
export const SHOT_SOUND: Record<TowerKind, Record<Faction, SoundId>> = {
  rifleNest: everyFaction('rifleShot'),
  aaGun: everyFaction('aaGunBurst'),
  cannon: { us: 'missileLaunch', china: 'missileLaunch', russia: 'gunReport', insurgents: 'recoillessBlast' },
  mortar: everyFaction('mortarLaunch'),
  sniper: everyFaction('rifleShot'),
};

/**
 * A sim event as the audio sees it. Shots carry the firing tower's kind, looked up by the scene (`undefined` once the
 * tower is gone); a kill carries the enemy's kind. `shellIncoming` is the scene's, not the sim's: a shell about to land.
 */
export type SoundEvent =
  | { readonly type: 'towerFired' | 'shellFired'; readonly kind: TowerKind | undefined }
  | { readonly type: 'enemyKilled'; readonly enemy: EnemyKind }
  /** `holdovers`: enemies already on the field when the wave started. Any at all calls in reinforcements. */
  | { readonly type: 'waveStarted'; readonly holdovers: number }
  | { readonly type: 'shellIncoming' | 'shellLanded' | 'enemyLeaked' | 'victory' | 'defeat' };

/** The sound a sim event makes on a map whose towers are `defender`'s, or `null` for none. */
export function soundFor(event: SoundEvent, defender: Faction): SoundId | null {
  switch (event.type) {
    case 'towerFired':
    case 'shellFired':
      return event.kind === undefined ? null : SHOT_SOUND[event.kind][defender];
    case 'shellIncoming':
      return 'mortarWhistle';
    case 'shellLanded':
      return 'mortarBlast';
    case 'enemyKilled':
      return event.enemy === 'infantry' ? 'infantryHit' : 'vehicleExplosion';
    case 'enemyLeaked':
      return 'leak';
    case 'waveStarted':
      return event.holdovers > 0 ? 'waveReinforcements' : 'waveStart';
    case 'victory':
      return 'victory';
    case 'defeat':
      return 'defeat';
  }
}

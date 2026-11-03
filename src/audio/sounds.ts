import type { TowerKind } from '../data/towers';

/** Every sound the game plays. Each has a file in `src/data/sounds.ts`. */
export const SOUND_IDS = [
  'rifleShot',
  'aaGunShot',
  'cannonShot',
  'mortarLaunch',
  'shellExplosion',
  'enemyDeath',
  'leak',
  'waveStart',
  'victory',
  'defeat',
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

/** Each tower kind's shot: a hitscan tower's hit, or a shell tower's launch. Adding a kind needs a sound here. */
const SHOT_SOUND: Record<TowerKind, SoundId> = {
  rifleNest: 'rifleShot',
  aaGun: 'aaGunShot',
  cannon: 'cannonShot',
  mortar: 'mortarLaunch',
};

/**
 * A sim event as the audio sees it. Shots carry the firing tower's kind, looked up by the scene (`undefined` once the
 * tower is gone).
 */
export type SoundEvent =
  | { readonly type: 'towerFired' | 'shellFired'; readonly kind: TowerKind | undefined }
  | { readonly type: 'shellLanded' | 'enemyKilled' | 'enemyLeaked' | 'waveStarted' | 'victory' | 'defeat' };

/** The sound a sim event makes, or `null` for none. */
export function soundFor(event: SoundEvent): SoundId | null {
  switch (event.type) {
    case 'towerFired':
    case 'shellFired':
      return event.kind === undefined ? null : SHOT_SOUND[event.kind];
    case 'shellLanded':
      return 'shellExplosion';
    case 'enemyKilled':
      return 'enemyDeath';
    case 'enemyLeaked':
      return 'leak';
    case 'waveStarted':
      return 'waveStart';
    case 'victory':
      return 'victory';
    case 'defeat':
      return 'defeat';
  }
}

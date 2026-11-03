import aaGunShotUrl from '../../assets/rubberduck-bang-sfx/shot_02.ogg?url';
import rifleShotUrl from '../../assets/rubberduck-bang-sfx/shot_03.ogg?url';
import cannonShotUrl from '../../assets/rubberduck-bang-sfx/cannon_03.ogg?url';
import mortarLaunchUrl from '../../assets/rubberduck-bang-sfx/cannon_04.ogg?url';
import shellExplosionUrl from '../../assets/rubberduck-bang-sfx/bang_02.ogg?url';
import enemyDeathUrl from '../../assets/rubberduck-100-sfx/hit_02.ogg?url';
import leakUrl from '../../assets/rubberduck-100-sfx/bell_02.ogg?url';
import waveStartUrl from '../../assets/radio-cues/waveStart.ogg?url';
import victoryUrl from '../../assets/radio-cues/victory.ogg?url';
import defeatUrl from '../../assets/radio-cues/defeat.ogg?url';
import type { ThrottleConfig } from '../audio/audioOut';
import type { SoundId } from '../audio/sounds';

/** Each sound's file (assets/manifest.json: rubberduck-bang-sfx, rubberduck-100-sfx, radio-cues). */
export const SOUND_URLS: Record<SoundId, string> = {
  rifleShot: rifleShotUrl,
  aaGunShot: aaGunShotUrl,
  cannonShot: cannonShotUrl,
  mortarLaunch: mortarLaunchUrl,
  shellExplosion: shellExplosionUrl,
  enemyDeath: enemyDeathUrl,
  leak: leakUrl,
  waveStart: waveStartUrl,
  victory: victoryUrl,
  defeat: defeatUrl,
};

/** At most 3 plays of one sound per 150 ms, so a volley reads as a few shots, not a wall of noise. */
export const SOUND_THROTTLE: ThrottleConfig = { maxPlays: 3, windowMs: 150 };

/**
 * The radio comms cues (#396) and each one's length in ms: the music ducks while one plays. Built by
 * `scripts/radio-fx.ts`, which prints the lengths; a test checks them against the files.
 */
export const RADIO_CUE_MS: Partial<Record<SoundId, number>> = {
  waveStart: 1283,
  victory: 1880,
  defeat: 2850,
};

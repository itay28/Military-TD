import rifleShotUrl from '../../assets/weapon-sounds/rifleShot.ogg?url';
import aaGunBurstUrl from '../../assets/weapon-sounds/aaGunBurst.ogg?url';
import missileLaunchUrl from '../../assets/weapon-sounds/missileLaunch.ogg?url';
import gunReportUrl from '../../assets/weapon-sounds/gunReport.ogg?url';
import recoillessBlastUrl from '../../assets/weapon-sounds/recoillessBlast.ogg?url';
import mortarLaunchUrl from '../../assets/weapon-sounds/mortarLaunch.ogg?url';
import mortarWhistleUrl from '../../assets/weapon-sounds/mortarWhistle.ogg?url';
import mortarBlastUrl from '../../assets/weapon-sounds/mortarBlast.ogg?url';
import vehicleExplosionUrl from '../../assets/weapon-sounds/vehicleExplosion.ogg?url';
import infantryHitUrl from '../../assets/weapon-sounds/infantryHit.ogg?url';
import coldOpenUrl from '../../assets/radio-cues/coldOpen.ogg?url';
import waveStartUrl from '../../assets/radio-cues/waveStart.ogg?url';
import waveReinforcementsUrl from '../../assets/radio-cues/waveReinforcements.ogg?url';
import leakUrl from '../../assets/radio-cues/leak.ogg?url';
import victoryUrl from '../../assets/radio-cues/victory.ogg?url';
import defeatUrl from '../../assets/radio-cues/defeat.ogg?url';
import type { ThrottleConfig } from '../audio/audioOut';
import type { Falloff } from '../audio/distance';
import type { SoundId } from '../audio/sounds';

/**
 * Each sound's file (assets/manifest.json: weapon-sounds, built by `npm run weapon-fx`; radio-cues, built by
 * `npm run radio-fx`).
 */
export const SOUND_URLS: Record<SoundId, string> = {
  rifleShot: rifleShotUrl,
  aaGunBurst: aaGunBurstUrl,
  missileLaunch: missileLaunchUrl,
  gunReport: gunReportUrl,
  recoillessBlast: recoillessBlastUrl,
  mortarLaunch: mortarLaunchUrl,
  mortarWhistle: mortarWhistleUrl,
  mortarBlast: mortarBlastUrl,
  vehicleExplosion: vehicleExplosionUrl,
  infantryHit: infantryHitUrl,
  leak: leakUrl,
  coldOpen: coldOpenUrl,
  waveStart: waveStartUrl,
  waveReinforcements: waveReinforcementsUrl,
  victory: victoryUrl,
  defeat: defeatUrl,
};

/** At most 3 plays of one sound per 150 ms, so a volley reads as a few shots, not a wall of noise. */
export const SOUND_THROTTLE: ThrottleConfig = { maxPlays: 3, windowMs: 150 };

/**
 * Sounds with their own limit: a leak is a radio call (#405), so a burst of leaks calls it once, and again only once
 * the call is long over.
 */
export const SOUND_THROTTLE_BY_ID: Partial<Record<SoundId, ThrottleConfig>> = { leak: { maxPlays: 1, windowMs: 6000 } };

/**
 * The radio comms cues (#396, the leak call #405, the cold open #477) and each one's length in ms: the music ducks while one plays. Built by
 * `scripts/radio-fx.ts`, which prints the lengths; a test checks them against the files.
 */
export const RADIO_CUE_MS: Partial<Record<SoundId, number>> = {
  coldOpen: 2680,
  waveStart: 2750,
  waveReinforcements: 3500,
  leak: 1450,
  victory: 2180,
  defeat: 2450,
};

/** How long before a mortar shell lands its incoming whistle starts: the whistle's length. */
export const WHISTLE_LEAD_MS = 500;

/**
 * The distance feel: full volume within 5 tiles of the camera's centre, fading to 35 % at 16 tiles and beyond (a map is
 * about 20 tiles across), so the fight on screen is loudest but nothing goes silent.
 */
export const SOUND_FALLOFF: Falloff = { nearTiles: 5, farTiles: 16, minVolume: 0.35 };

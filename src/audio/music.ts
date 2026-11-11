/**
 * Music: which track each scene plays, and the controller that crossfades between them (#66). Presentation only, so it
 * lives outside `src/sim`; the sound itself is behind the `MusicBackend` seam (Phaser's in `phaserMusic.ts`, a fake in
 * tests).
 */

import type { Phase } from '../sim/game';
import type { AudioOut } from './audioOut';
import type { Channel } from './volume';

/**
 * A looping track: music (`assets/yd-war-on-water/<id>.{ogg,mp3}`), or the battlefield ambience the Game plays instead
 * (#405, `assets/battlefield-ambience/<id>.{ogg,mp3}`): the ambient bed and its combat layer.
 */
export type TrackId = 'menu' | 'game' | 'ambient' | 'combat';

export const TRACK_IDS: readonly TrackId[] = ['menu', 'game', 'ambient', 'combat'];

/**
 * The volume each track fades in to (0–1), scaled by its channel's volume (#67). The menu track is mixed lower: it sat
 * too loud.
 */
export const TRACK_VOLUME: Readonly<Record<TrackId, number>> = { menu: 0.6, game: 1, ambient: 1, combat: 1 };

/**
 * The volume setting each track follows: the ambience is world sound, so it's a sound effect, and turning the music
 * down leaves the battlefield.
 */
export const TRACK_CHANNEL: Readonly<Record<TrackId, Channel>> = {
  menu: 'music',
  game: 'music',
  ambient: 'sfx',
  combat: 'sfx',
};

/**
 * A layer plays along with its track, from the same start, silent until `setCombat(true)`: the ambient bed's combat
 * layer (denser distant fire) comes in during a wave.
 */
export const TRACK_LAYER: Readonly<Partial<Record<TrackId, TrackId>>> = { ambient: 'combat' };

/** How long a layer takes to come in at a wave's start, and to go out at its end. */
export const LAYER_FADE_MS = 3000;

/** The End screen: an overlay on the Game, but with its own track, so the Game names it to the controller. */
export const END_SCREEN = 'End';

/** How long the old track fades out and the new one fades in when the track changes. */
export const CROSSFADE_MS = 1000;

/** The music's volume while a radio cue plays (#396), so the voice is clear. */
export const DUCK_VOLUME = 0.4;

/** How long the music takes to drop to the duck volume, and to come back up. */
export const DUCK_FADE_MS = 200;

/** How long the playing track takes to reach a new volume (a slider moved, the tab hidden or shown). */
export const VOLUME_RAMP_MS = 100;

/**
 * The track a scene plays: the menu track on the Main menu and Level select (Settings and Credits are overlays on the
 * Main menu, so they keep it), the ambient bed in the Game (#405), and the game track under "Mission complete/failed" on
 * the End screen. Boot, or any scene this doesn't know, is silent.
 */
export function trackFor(scene: string): TrackId | null {
  switch (scene) {
    case 'Menu':
    case 'LevelSelect':
      return 'menu';
    case 'Game':
      return 'ambient';
    case END_SCREEN:
      return 'game';
    default:
      return null;
  }
}

/** What the Game asks of the controller in `phase`: its scene (the End screen once the game is over), and the combat layer during a wave. */
export function gameMusic(phase: Phase): { readonly scene: string; readonly combat: boolean } {
  const over = phase === 'victory' || phase === 'defeat';
  return { scene: over ? END_SCREEN : 'Game', combat: phase === 'wave' };
}

/** One playing copy of a track, looping, started at volume 0. */
export interface MusicVoice {
  /** Ramps the volume to `volume` (0–1) over `ms`, then calls `onDone`. A new fade replaces the one in progress. */
  fadeTo(volume: number, ms: number, onDone?: () => void): void;
  stop(): void;
}

export interface MusicBackend {
  /** Starts `track` looping at volume 0, or returns null when it can't (its file didn't load): that track stays silent. */
  start(track: TrackId): MusicVoice | null;
}

export interface MusicController {
  /** Call when a scene starts: keeps the track if it's the same, crossfades otherwise. */
  enterScene(scene: string): void;
  /** Call on the first input: browsers block audio until then, so nothing plays before it. */
  unlock(): void;
  /** Drops the music to `DUCK_VOLUME` while a radio cue plays (true), and brings it back up afterwards (false). */
  setDucked(on: boolean): void;
  /** Call when the volume may have changed: the playing track ramps to `volume()`. */
  refreshVolume(): void;
  /** Brings the playing track's layer in (a wave is on, true) or takes it out (false). */
  setCombat(on: boolean): void;
}

/**
 * The radio cold open (#479): the first thing a player hears, before the menu music. The controller plays the
 * `coldOpen` cue on `audio` once a session, the first time the menu track would start, and holds the music for `ms`.
 */
export interface ColdOpenOptions {
  /** Where the cue plays: the SFX sink, so it follows the sound effects volume (#67). */
  readonly audio: AudioOut;
  /** The cue's length (`RADIO_CUE_MS.coldOpen`): the music starts once it's over. */
  readonly ms: number;
  /** Runs `run` after `ms` (a real-time timer in the game, a fake in tests). */
  readonly schedule: (ms: number, run: () => void) => void;
}

export interface MusicOptions {
  /** Test mode: the controller never touches the backend, so e2e runs and scenarios stay silent. */
  readonly muted: boolean;
  readonly crossfadeMs?: number;
  /** A channel's volume, 0–1, read at each fade-in and `refreshVolume` (#67). Full volume when not given. */
  readonly volume?: (channel: Channel) => number;
  /** Plays the radio cold open before the first menu track (#479). None by default. */
  readonly coldOpen?: ColdOpenOptions;
}

export function createMusicController(backend: MusicBackend, options: MusicOptions): MusicController {
  const fadeMs = options.crossfadeMs ?? CROSSFADE_MS;
  let ducked = false;
  let combat = false;
  const volume = options.volume ?? (() => 1);
  /** A track's volume: its channel's, scaled by the track's own mix level. */
  const level = (track: TrackId): number =>
    volume(TRACK_CHANNEL[track]) * TRACK_VOLUME[track] * (ducked ? DUCK_VOLUME : 1);
  /** A layer's volume: its track's level during a wave, silent otherwise. */
  const layerLevel = (layer: TrackId): number => (combat ? level(layer) : 0);
  let unlocked = false;
  /** The cold open hasn't had its turn yet: it gets one, the first time any track would start. */
  let coldOpenDue = options.coldOpen !== undefined;
  /** The cold open is playing: the music waits for it. */
  let holding = false;
  /** The track the current scene wants, whether or not it's playing yet. */
  let wanted: TrackId | null = null;
  /** The track playing (or failed to load, with no voice) since the last change, and its layer's voice. */
  let playing: {
    track: TrackId;
    voice: MusicVoice | null;
    layer: { track: TrackId; voice: MusicVoice } | null;
  } | null = null;

  const fadeOut = (voice: MusicVoice | null | undefined): void => {
    voice?.fadeTo(0, fadeMs, () => voice.stop());
  };
  const start = (track: TrackId): MusicVoice | null => {
    try {
      return backend.start(track);
    } catch {
      return null;
    }
  };

  const sync = (): void => {
    if (options.muted || !unlocked || holding || playing?.track === wanted) return;
    if (coldOpenDue && wanted !== null) {
      coldOpenDue = false;
      const coldOpen = options.coldOpen;
      if (coldOpen && wanted === 'menu') {
        holding = true;
        coldOpen.audio.play('coldOpen');
        coldOpen.schedule(coldOpen.ms, () => {
          holding = false;
          sync();
        });
        return;
      }
    }
    if (playing) {
      fadeOut(playing.voice);
      fadeOut(playing.layer?.voice);
    }
    playing = null;
    if (wanted === null) return;
    const voice = start(wanted);
    voice?.fadeTo(level(wanted), fadeMs);
    const layerTrack = TRACK_LAYER[wanted];
    const layerVoice = layerTrack === undefined ? null : start(layerTrack);
    const layer = layerTrack !== undefined && layerVoice ? { track: layerTrack, voice: layerVoice } : null;
    if (layer) layer.voice.fadeTo(layerLevel(layer.track), fadeMs);
    playing = { track: wanted, voice, layer };
  };

  /** Ramps the playing track and its layer to their volumes now. */
  const ramp = (ms: number): void => {
    if (!playing) return;
    playing.voice?.fadeTo(level(playing.track), ms);
    playing.layer?.voice.fadeTo(layerLevel(playing.layer.track), ms);
  };

  return {
    enterScene(scene) {
      wanted = trackFor(scene);
      sync();
    },
    unlock() {
      if (unlocked) return;
      unlocked = true;
      sync();
    },
    setDucked(on) {
      if (on === ducked) return;
      ducked = on;
      ramp(DUCK_FADE_MS);
    },
    refreshVolume() {
      ramp(VOLUME_RAMP_MS);
    },
    setCombat(on) {
      if (on === combat) return;
      combat = on;
      if (playing?.layer) playing.layer.voice.fadeTo(layerLevel(playing.layer.track), LAYER_FADE_MS);
    },
  };
}

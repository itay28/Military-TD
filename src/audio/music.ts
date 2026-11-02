/**
 * Music: which track each scene plays, and the controller that crossfades between them (#66). Presentation only, so it
 * lives outside `src/sim`; the sound itself is behind the `MusicBackend` seam (Phaser's in `phaserMusic.ts`, a fake in
 * tests).
 */

/** A looping music track. Its files are `assets/yd-war-on-water/<id>.{ogg,mp3}`. */
export type TrackId = 'menu' | 'game';

export const TRACK_IDS: readonly TrackId[] = ['menu', 'game'];

/** How long the old track fades out and the new one fades in when the track changes. */
export const CROSSFADE_MS = 1000;

/**
 * The track a scene plays: the menu track on the Main menu and Level select (Settings and Credits are overlays on the
 * Main menu, so they keep it), the game track in the Game (the End screen is an overlay on it). Boot, or any scene this
 * doesn't know, is silent.
 */
export function trackFor(scene: string): TrackId | null {
  switch (scene) {
    case 'Menu':
    case 'LevelSelect':
      return 'menu';
    case 'Game':
      return 'game';
    default:
      return null;
  }
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
}

export interface MusicOptions {
  /** Test mode: the controller never touches the backend, so e2e runs and scenarios stay silent. */
  readonly muted: boolean;
  readonly crossfadeMs?: number;
}

export function createMusicController(backend: MusicBackend, options: MusicOptions): MusicController {
  const fadeMs = options.crossfadeMs ?? CROSSFADE_MS;
  let unlocked = false;
  /** The track the current scene wants, whether or not it's playing yet. */
  let wanted: TrackId | null = null;
  /** The track playing (or failed to load, with no voice) since the last change. */
  let playing: { track: TrackId; voice: MusicVoice | null } | null = null;

  const fadeOut = (voice: MusicVoice | null): void => {
    voice?.fadeTo(0, fadeMs, () => voice.stop());
  };

  const sync = (): void => {
    if (options.muted || !unlocked || playing?.track === wanted) return;
    if (playing) fadeOut(playing.voice);
    playing = null;
    if (wanted === null) return;
    let voice: MusicVoice | null;
    try {
      voice = backend.start(wanted);
    } catch {
      voice = null;
    }
    voice?.fadeTo(1, fadeMs);
    playing = { track: wanted, voice };
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
  };
}

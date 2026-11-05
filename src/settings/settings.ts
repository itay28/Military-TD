import { GAME_SPEEDS, type GameSpeed } from '../scenes/gameSpeed';

/** The player's settings. Read live: a change applies from the next frame, or the next game for a default. */
export interface Settings {
  /** The game speed each new game starts at. */
  readonly defaultSpeed: GameSpeed;
  /** Draw every tower's range ring, not just the hovered or selected tower's. */
  readonly showAllRanges: boolean;
  /** Draw the tactical map grid with its lettered columns and numbered rows (#400). */
  readonly showMapGrid: boolean;
  /** Scales every sound, 0–100 (#67). What plays is master × channel (`effectiveVolume`, src/audio/volume.ts). */
  readonly masterVolume: number;
  /** The music channel, 0–100. */
  readonly musicVolume: number;
  /** The sound-effects channel, 0–100. */
  readonly sfxVolume: number;
}

/** The settings that are volumes: each a whole number from 0 to 100. */
export const VOLUME_FIELDS = ['masterVolume', 'musicVolume', 'sfxVolume'] as const;
export type VolumeField = (typeof VOLUME_FIELDS)[number];
export const MAX_VOLUME = 100;

export const DEFAULT_SETTINGS: Settings = {
  defaultSpeed: 1,
  showAllRanges: false,
  showMapGrid: true,
  masterVolume: 80,
  musicVolume: 60,
  sfxVolume: 80,
};

/** The one place the settings live. `createPersistedSettings` (persist.ts) saves them between visits. */
export interface SettingsStore {
  get(): Settings;
  /**
   * Merges `patch` into the settings. Throws RangeError for a default speed that isn't a game speed, or a volume that
   * isn't a whole number from 0 to 100; nothing changes then.
   */
  set(patch: Partial<Settings>): void;
  /** Calls `listener` after each change, until the returned function is called. */
  subscribe(listener: () => void): () => void;
}

const isVolume = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= MAX_VOLUME;

export function createSettings(initial: Settings = DEFAULT_SETTINGS): SettingsStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(patch) {
      if (patch.defaultSpeed !== undefined && !GAME_SPEEDS.includes(patch.defaultSpeed))
        throw new RangeError(`${patch.defaultSpeed} is not a game speed (${GAME_SPEEDS.join(', ')})`);
      for (const field of VOLUME_FIELDS) {
        const value = patch[field];
        if (value !== undefined && !isVolume(value))
          throw new RangeError(`${field} ${value} is not a whole number from 0 to ${MAX_VOLUME}`);
      }
      current = { ...current, ...patch };
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

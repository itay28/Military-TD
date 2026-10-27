import { GAME_SPEEDS, type GameSpeed } from '../scenes/gameSpeed';

/** The player's settings. Read live: a change applies from the next frame, or the next game for a default. */
export interface Settings {
  /** The game speed each new game starts at. */
  readonly defaultSpeed: GameSpeed;
  /** Draw every tower's range ring, not just the hovered or selected tower's. */
  readonly showAllRanges: boolean;
}

export const DEFAULT_SETTINGS: Settings = { defaultSpeed: 1, showAllRanges: false };

/** The one place the settings live. Saving them between visits is #49. */
export interface SettingsStore {
  get(): Settings;
  /** Merges `patch` into the settings. Throws RangeError for a default speed that isn't a game speed. */
  set(patch: Partial<Settings>): void;
}

export function createSettings(initial: Settings = DEFAULT_SETTINGS): SettingsStore {
  let current = initial;
  return {
    get: () => current,
    set(patch) {
      if (patch.defaultSpeed !== undefined && !GAME_SPEEDS.includes(patch.defaultSpeed))
        throw new RangeError(`${patch.defaultSpeed} is not a game speed (${GAME_SPEEDS.join(', ')})`);
      current = { ...current, ...patch };
    },
  };
}

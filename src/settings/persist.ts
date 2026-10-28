import { GAME_SPEEDS } from '../scenes/gameSpeed';
import { createSettings, DEFAULT_SETTINGS, type Settings, type SettingsStore } from './settings';

/** The part of `localStorage` the settings use, so tests inject a fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SETTINGS_KEY = 'military-td.settings';
/** Bump when the saved shape changes, and teach `migrate` the step from the old version. */
export const SETTINGS_VERSION = 1;

export function createMemoryStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

/** `localStorage`, or memory when the browser blocks it (reading the property throws in some private modes). */
export function browserStorage(scope: { readonly localStorage?: KeyValueStorage } = globalThis): KeyValueStorage {
  try {
    return scope.localStorage ?? createMemoryStorage();
  } catch {
    return createMemoryStorage();
  }
}

/** Brings settings saved at `version` up to the current shape. `null` for a version this build can't read. */
export function migrate(version: number, data: unknown): unknown {
  if (!Number.isInteger(version) || version < 0 || version > SETTINGS_VERSION) return null;
  // v1 is the first shape: nothing to change yet. Later versions add a step per version here.
  return data;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keeps each known field that holds a valid value; every other field takes its default. Unknown fields are dropped. */
function sanitize(data: unknown): Settings {
  const raw = isRecord(data) ? data : {};
  const { defaultSpeed, showAllRanges } = raw;
  return {
    defaultSpeed: GAME_SPEEDS.find((speed) => speed === defaultSpeed) ?? DEFAULT_SETTINGS.defaultSpeed,
    showAllRanges: typeof showAllRanges === 'boolean' ? showAllRanges : DEFAULT_SETTINGS.showAllRanges,
  };
}

/** The saved settings, or the defaults for anything missing, corrupt, too new or unreadable. Never throws. */
export function loadSettings(storage: KeyValueStorage): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || typeof saved.version !== 'number') return DEFAULT_SETTINGS;
    const migrated = migrate(saved.version, saved.settings);
    return migrated === null ? DEFAULT_SETTINGS : sanitize(migrated);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Settings loaded from `storage` and saved back as `{ version, settings }` on every change. A failed save is ignored. */
export function createPersistedSettings(storage: KeyValueStorage): SettingsStore {
  const store = createSettings(loadSettings(storage));
  return {
    get: store.get,
    set(patch) {
      store.set(patch);
      try {
        storage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings: store.get() }));
      } catch {
        // Storage is full or blocked: the settings still hold for this visit.
      }
    },
  };
}

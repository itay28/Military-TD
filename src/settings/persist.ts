import { GAME_SPEEDS } from '../scenes/gameSpeed';
import { browserStorage, createMemoryStorage, isRecord, type KeyValueStorage } from '../storage';
import {
  createSettings,
  DEFAULT_SETTINGS,
  MAX_VOLUME,
  TEXT_SIZES,
  VOLUME_FIELDS,
  type Settings,
  type SettingsStore,
  type VolumeField,
} from './settings';

export const SETTINGS_KEY = 'military-td.settings';
/** Bump when the saved shape changes, and teach `migrate` the step from the old version. */
export const SETTINGS_VERSION = 4;

/** Brings settings saved at `version` up to the current shape. `null` for a version this build can't read. */
export function migrate(version: number, data: unknown): unknown {
  if (!Number.isInteger(version) || version < 0 || version > SETTINGS_VERSION) return null;
  let migrated = data;
  // v1 → v2 (#67): the volumes arrive, at their defaults; the speed and ranges stay. v0 had v1's shape.
  if (version < 2 && isRecord(migrated)) migrated = { ...migrated, ...defaultVolumes() };
  // v2 → v3 (#354): text size starts at 100 %. Reduced motion stays unset, so it follows the system's preference.
  if (version < 3 && isRecord(migrated)) migrated = { ...migrated, textSize: DEFAULT_SETTINGS.textSize };
  // v3 → v4 (#413): Tactical mode arrives, off: waves come on their timers.
  if (version < 4 && isRecord(migrated)) migrated = { ...migrated, tacticalMode: DEFAULT_SETTINGS.tacticalMode };
  return migrated;
}

function defaultVolumes(): Pick<Settings, VolumeField> {
  const { masterVolume, musicVolume, sfxVolume } = DEFAULT_SETTINGS;
  return { masterVolume, musicVolume, sfxVolume };
}

/** A saved volume clamped to 0–100 and rounded, or the default for anything that isn't a finite number. */
function sanitizeVolume(value: unknown, field: VolumeField): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS[field];
  return Math.min(MAX_VOLUME, Math.max(0, Math.round(value)));
}

/** Keeps each known field that holds a valid value; every other field takes its default. Unknown fields are dropped. */
function sanitize(data: unknown, defaults: Settings): Settings {
  const raw = isRecord(data) ? data : {};
  const { defaultSpeed, showAllRanges, reducedMotion, textSize, tacticalMode } = raw;
  const volumes = Object.fromEntries(VOLUME_FIELDS.map((field) => [field, sanitizeVolume(raw[field], field)]));
  return {
    defaultSpeed: GAME_SPEEDS.find((speed) => speed === defaultSpeed) ?? defaults.defaultSpeed,
    showAllRanges: typeof showAllRanges === 'boolean' ? showAllRanges : defaults.showAllRanges,
    ...(volumes as Pick<Settings, VolumeField>),
    reducedMotion: typeof reducedMotion === 'boolean' ? reducedMotion : defaults.reducedMotion,
    textSize: TEXT_SIZES.find((size) => size === textSize) ?? defaults.textSize,
    tacticalMode: typeof tacticalMode === 'boolean' ? tacticalMode : defaults.tacticalMode,
  };
}

/**
 * The saved settings, or `defaults` for anything missing, corrupt, too new or unreadable. Never throws. `defaults`
 * comes from `defaultSettings`, so a missing reduced-motion choice follows the system's preference.
 */
export function loadSettings(storage: KeyValueStorage, defaults: Settings = DEFAULT_SETTINGS): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return defaults;
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || typeof saved.version !== 'number') return defaults;
    const migrated = migrate(saved.version, saved.settings);
    return migrated === null ? defaults : sanitize(migrated, defaults);
  } catch {
    return defaults;
  }
}

/** Settings loaded from `storage` and saved back as `{ version, settings }` on every change. A failed save is ignored. */
export function createPersistedSettings(
  storage: KeyValueStorage,
  defaults: Settings = DEFAULT_SETTINGS,
): SettingsStore {
  const store = createSettings(loadSettings(storage, defaults));
  return {
    get: store.get,
    subscribe: store.subscribe,
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

export { browserStorage, createMemoryStorage, type KeyValueStorage };

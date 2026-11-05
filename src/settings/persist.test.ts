import { describe, expect, it } from 'vitest';
import {
  browserStorage,
  createMemoryStorage,
  createPersistedSettings,
  loadSettings,
  migrate,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  type KeyValueStorage,
} from './persist';
import { DEFAULT_SETTINGS, defaultSettings } from './settings';

const saved = (storage: KeyValueStorage) => JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null');
const withRaw = (raw: string) => {
  const storage = createMemoryStorage();
  storage.setItem(SETTINGS_KEY, raw);
  return storage;
};
const throwing = (on: 'get' | 'set' | 'both'): KeyValueStorage => ({
  getItem() {
    if (on !== 'set') throw new Error('SecurityError');
    return null;
  },
  setItem() {
    if (on !== 'get') throw new Error('QuotaExceededError');
  },
});

describe('createPersistedSettings', () => {
  it('saves { version, settings } under one key on every change', () => {
    const storage = createMemoryStorage();
    const settings = createPersistedSettings(storage);
    settings.set({ defaultSpeed: 2 });
    expect(saved(storage)).toEqual({ version: SETTINGS_VERSION, settings: { ...DEFAULT_SETTINGS, defaultSpeed: 2 } });
    settings.set({ showAllRanges: true });
    expect(saved(storage)).toEqual({
      version: SETTINGS_VERSION,
      settings: { ...DEFAULT_SETTINGS, defaultSpeed: 2, showAllRanges: true },
    });
  });

  it('loads the saved settings at boot', () => {
    const storage = createMemoryStorage();
    const chosen = {
      defaultSpeed: 3,
      showAllRanges: true,
      masterVolume: 50,
      musicVolume: 0,
      sfxVolume: 100,
      reducedMotion: true,
      textSize: 125,
    } as const;
    createPersistedSettings(storage).set(chosen);
    expect(createPersistedSettings(storage).get()).toEqual(chosen);
  });

  it('does not save a change that set rejects', () => {
    const storage = createMemoryStorage();
    const settings = createPersistedSettings(storage);
    expect(() => settings.set({ defaultSpeed: 4 as never })).toThrow(RangeError);
    expect(storage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('keeps working in memory when storage cannot be read', () => {
    const settings = createPersistedSettings(throwing('both'));
    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
    settings.set({ defaultSpeed: 2 });
    expect(settings.get().defaultSpeed).toBe(2);
  });

  it('keeps the change in memory when storage cannot be written', () => {
    const settings = createPersistedSettings(throwing('set'));
    expect(() => settings.set({ showAllRanges: true })).not.toThrow();
    expect(settings.get().showAllRanges).toBe(true);
  });
});

describe('loadSettings', () => {
  it('returns the defaults when nothing is saved', () => {
    expect(loadSettings(createMemoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['null', 'null'],
    ['a number', '7'],
    ['an array', '[]'],
    ['no settings object', JSON.stringify({ version: 1 })],
    ['settings that is not an object', JSON.stringify({ version: 1, settings: 'fast' })],
    ['no version', JSON.stringify({ settings: { defaultSpeed: 3, showAllRanges: true } })],
  ])('returns the defaults for %s', (_name, raw) => {
    expect(loadSettings(withRaw(raw))).toEqual(DEFAULT_SETTINGS);
  });

  const v2 = (settings: object) => withRaw(JSON.stringify({ version: 2, settings }));

  it('falls back to the default field by field', () => {
    expect(loadSettings(v2({ defaultSpeed: 4, showAllRanges: true }))).toEqual({
      ...DEFAULT_SETTINGS,
      showAllRanges: true,
    });
    expect(loadSettings(v2({ defaultSpeed: 3, showAllRanges: 'yes' }))).toEqual({
      ...DEFAULT_SETTINGS,
      defaultSpeed: 3,
    });
  });

  it('clamps an out-of-range volume to 0–100 and rounds it to a whole number', () => {
    expect(loadSettings(v2({ masterVolume: 150, musicVolume: -5, sfxVolume: 42.6 }))).toEqual({
      ...DEFAULT_SETTINGS,
      masterVolume: 100,
      musicVolume: 0,
      sfxVolume: 43,
    });
  });

  it.each([
    ['a string', '50'],
    ['null', null],
    ['NaN (saved as null)', Number.NaN],
    ['a boolean', true],
  ])('gives a volume that is %s its default', (_name, value) => {
    expect(loadSettings(v2({ masterVolume: value, musicVolume: value, sfxVolume: value }))).toEqual(DEFAULT_SETTINGS);
  });

  it('drops unknown fields', () => {
    expect(loadSettings(v2({ defaultSpeed: 2, volume: 11 }))).toEqual({ ...DEFAULT_SETTINGS, defaultSpeed: 2 });
  });

  it('returns the defaults for a version newer than this build knows', () => {
    const raw = JSON.stringify({ version: SETTINGS_VERSION + 1, settings: { defaultSpeed: 3, showAllRanges: true } });
    expect(loadSettings(withRaw(raw))).toEqual(DEFAULT_SETTINGS);
  });

  it('migrates a v1 save: its speed and ranges stay, the volumes take their defaults', () => {
    const raw = JSON.stringify({ version: 1, settings: { defaultSpeed: 3, showAllRanges: true } });
    expect(loadSettings(withRaw(raw))).toEqual({ ...DEFAULT_SETTINGS, defaultSpeed: 3, showAllRanges: true });
  });

  it('migrates an older version', () => {
    const raw = JSON.stringify({ version: 0, settings: { defaultSpeed: 3, showAllRanges: true } });
    expect(loadSettings(withRaw(raw))).toEqual({ ...DEFAULT_SETTINGS, defaultSpeed: 3, showAllRanges: true });
  });

  it('migrates a v2 save: its values stay, text size is 100 and reduced motion follows the system', () => {
    const v2 = { defaultSpeed: 2, showAllRanges: true, masterVolume: 40, musicVolume: 30, sfxVolume: 20 } as const;
    const raw = JSON.stringify({ version: 2, settings: v2 });
    expect(loadSettings(withRaw(raw))).toEqual({ ...v2, reducedMotion: false, textSize: 100 });
    const prefersLess = defaultSettings({ prefersReducedMotion: true });
    expect(loadSettings(withRaw(raw), prefersLess)).toEqual({ ...v2, reducedMotion: true, textSize: 100 });
  });

  it.each([110, '150', null, 1.5])('falls back to text size 100 for a saved %j', (textSize) => {
    const raw = JSON.stringify({ version: SETTINGS_VERSION, settings: { ...DEFAULT_SETTINGS, textSize } });
    expect(loadSettings(withRaw(raw))).toEqual(DEFAULT_SETTINGS);
  });

  it.each(['yes', 1, null])('falls back to the system preference for a saved reducedMotion of %j', (reducedMotion) => {
    const raw = JSON.stringify({ version: SETTINGS_VERSION, settings: { ...DEFAULT_SETTINGS, reducedMotion } });
    expect(loadSettings(withRaw(raw))).toEqual(DEFAULT_SETTINGS);
    const prefersLess = defaultSettings({ prefersReducedMotion: true });
    expect(loadSettings(withRaw(raw), prefersLess)).toEqual(prefersLess);
  });

  it('keeps a saved reducedMotion of false even when the system prefers less motion: the player chose it', () => {
    const raw = JSON.stringify({ version: SETTINGS_VERSION, settings: { ...DEFAULT_SETTINGS, reducedMotion: false } });
    expect(loadSettings(withRaw(raw), defaultSettings({ prefersReducedMotion: true })).reducedMotion).toBe(false);
  });

  it('starts at the given defaults with nothing saved', () => {
    const prefersLess = defaultSettings({ prefersReducedMotion: true });
    expect(createPersistedSettings(createMemoryStorage(), prefersLess).get()).toEqual(prefersLess);
  });

  it('returns the defaults when reading storage throws', () => {
    expect(loadSettings(throwing('get'))).toEqual(DEFAULT_SETTINGS);
  });
});

describe('migrate', () => {
  it('is at version 3, the first with reduced motion and text size', () => {
    expect(SETTINGS_VERSION).toBe(3);
  });

  it('brings v1 (and v0) up to v3 by adding the default volumes and text size', () => {
    const v1 = { defaultSpeed: 2, showAllRanges: true };
    const v3 = { ...v1, masterVolume: 80, musicVolume: 60, sfxVolume: 80, textSize: 100 };
    expect(migrate(1, v1)).toEqual(v3);
    expect(migrate(0, v1)).toEqual(v3);
  });

  it('brings v2 up to v3 by adding text size 100; reduced motion stays unset, to follow the system', () => {
    const v2 = { defaultSpeed: 2, showAllRanges: true, masterVolume: 1, musicVolume: 2, sfxVolume: 3 };
    expect(migrate(2, v2)).toEqual({ ...v2, textSize: 100 });
  });

  it('keeps a v1 save’s other fields for sanitize to judge, and leaves a v3 save as it is', () => {
    expect(migrate(1, { defaultSpeed: 9 })).toEqual({
      defaultSpeed: 9,
      masterVolume: 80,
      musicVolume: 60,
      sfxVolume: 80,
      textSize: 100,
    });
    const data = {
      defaultSpeed: 2,
      showAllRanges: true,
      masterVolume: 1,
      musicVolume: 2,
      sfxVolume: 3,
      reducedMotion: true,
      textSize: 150,
    };
    expect(migrate(3, data)).toEqual(data);
  });

  it('passes a v1 save that is not an object on, for sanitize to replace', () => {
    expect(migrate(1, 'fast')).toBe('fast');
  });

  it('refuses a newer or malformed version', () => {
    expect(migrate(SETTINGS_VERSION + 1, {})).toBeNull();
    expect(migrate(-1, {})).toBeNull();
    expect(migrate(1.5, {})).toBeNull();
    expect(migrate(Number.NaN, {})).toBeNull();
  });
});

describe('createMemoryStorage', () => {
  it('stores and returns values, and null for a missing key', () => {
    const storage = createMemoryStorage();
    expect(storage.getItem('a')).toBeNull();
    storage.setItem('a', 'b');
    expect(storage.getItem('a')).toBe('b');
  });
});

describe('browserStorage', () => {
  it('uses localStorage when it is there', () => {
    const local = createMemoryStorage();
    browserStorage({ localStorage: local }).setItem('k', 'v');
    expect(local.getItem('k')).toBe('v');
  });

  it('falls back to memory when touching localStorage throws, as in private mode', () => {
    const blocked = {
      get localStorage(): KeyValueStorage {
        throw new Error('SecurityError');
      },
    };
    const storage = browserStorage(blocked);
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
  });

  it('falls back to memory when there is no localStorage', () => {
    expect(() => browserStorage({}).setItem('k', 'v')).not.toThrow();
  });
});

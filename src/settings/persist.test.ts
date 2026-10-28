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
import { DEFAULT_SETTINGS } from './settings';

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
    expect(saved(storage)).toEqual({ version: SETTINGS_VERSION, settings: { defaultSpeed: 2, showAllRanges: false } });
    settings.set({ showAllRanges: true });
    expect(saved(storage)).toEqual({ version: SETTINGS_VERSION, settings: { defaultSpeed: 2, showAllRanges: true } });
  });

  it('loads the saved settings at boot', () => {
    const storage = createMemoryStorage();
    createPersistedSettings(storage).set({ defaultSpeed: 3, showAllRanges: true });
    expect(createPersistedSettings(storage).get()).toEqual({ defaultSpeed: 3, showAllRanges: true });
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

  it('falls back to the default field by field', () => {
    const raw = JSON.stringify({ version: 1, settings: { defaultSpeed: 4, showAllRanges: true } });
    expect(loadSettings(withRaw(raw))).toEqual({ defaultSpeed: 1, showAllRanges: true });
    const raw2 = JSON.stringify({ version: 1, settings: { defaultSpeed: 3, showAllRanges: 'yes' } });
    expect(loadSettings(withRaw(raw2))).toEqual({ defaultSpeed: 3, showAllRanges: false });
  });

  it('drops unknown fields', () => {
    const raw = JSON.stringify({ version: 1, settings: { defaultSpeed: 2, volume: 11 } });
    expect(loadSettings(withRaw(raw))).toEqual({ defaultSpeed: 2, showAllRanges: false });
  });

  it('returns the defaults for a version newer than this build knows', () => {
    const raw = JSON.stringify({ version: SETTINGS_VERSION + 1, settings: { defaultSpeed: 3, showAllRanges: true } });
    expect(loadSettings(withRaw(raw))).toEqual(DEFAULT_SETTINGS);
  });

  it('migrates an older version', () => {
    const raw = JSON.stringify({ version: 0, settings: { defaultSpeed: 3, showAllRanges: true } });
    expect(loadSettings(withRaw(raw))).toEqual({ defaultSpeed: 3, showAllRanges: true });
  });

  it('returns the defaults when reading storage throws', () => {
    expect(loadSettings(throwing('get'))).toEqual(DEFAULT_SETTINGS);
  });
});

describe('migrate', () => {
  it('brings an older version up to the current one (v1 has nothing to change)', () => {
    const data = { defaultSpeed: 2, showAllRanges: true };
    expect(migrate(0, data)).toEqual(data);
    expect(migrate(SETTINGS_VERSION, data)).toEqual(data);
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

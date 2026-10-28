import { describe, expect, it } from 'vitest';
import { createMemoryStorage, SETTINGS_KEY, type KeyValueStorage } from '../settings/persist';
import { createPersistedProgress, loadProgress, migrate, PROGRESS_KEY, PROGRESS_VERSION } from './persist';
import { EMPTY_PROGRESS } from './progress';

const saved = (storage: KeyValueStorage) => JSON.parse(storage.getItem(PROGRESS_KEY) ?? 'null');
const withRaw = (raw: string) => {
  const storage = createMemoryStorage();
  storage.setItem(PROGRESS_KEY, raw);
  return storage;
};
const withProgress = (maps: unknown, version = PROGRESS_VERSION) =>
  withRaw(JSON.stringify({ version, progress: { maps } }));
const throwing = (on: 'get' | 'set'): KeyValueStorage => ({
  getItem() {
    if (on === 'get') throw new Error('SecurityError');
    return null;
  },
  setItem() {
    if (on === 'set') throw new Error('QuotaExceededError');
  },
});

describe('createPersistedProgress', () => {
  it('saves { version, progress } under its own key on every result', () => {
    const storage = createMemoryStorage();
    const progress = createPersistedProgress(storage);
    progress.recordResult('a', 2);
    expect(saved(storage)).toEqual({
      version: PROGRESS_VERSION,
      progress: { maps: { a: { completed: true, bestStars: 2 } } },
    });
    expect(PROGRESS_KEY).toBe('military-td.progress');
  });

  it('leaves the settings key alone', () => {
    const storage = createMemoryStorage();
    createPersistedProgress(storage).recordResult('a', 1);
    expect(storage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('loads the saved progress at boot', () => {
    const progress = createPersistedProgress(withProgress({ a: { completed: true, bestStars: 3 } }));
    expect(progress.get().maps.a).toEqual({ completed: true, bestStars: 3 });
  });

  it('keeps a better saved result when a worse win comes in', () => {
    const storage = withProgress({ a: { completed: true, bestStars: 3 } });
    createPersistedProgress(storage).recordResult('a', 1);
    expect(saved(storage).progress.maps.a.bestStars).toBe(3);
  });

  it('ignores a failed save', () => {
    const progress = createPersistedProgress(throwing('set'));
    expect(() => progress.recordResult('a', 2)).not.toThrow();
    expect(progress.get().maps.a?.bestStars).toBe(2);
  });
});

describe('loadProgress', () => {
  it('gives empty progress when nothing is saved', () => {
    expect(loadProgress(createMemoryStorage())).toEqual(EMPTY_PROGRESS);
  });

  it.each([
    ['unparsable', '{nope'],
    ['not an object', '3'],
    ['no version', JSON.stringify({ progress: { maps: {} } })],
    [
      'too-new version',
      JSON.stringify({ version: PROGRESS_VERSION + 1, progress: { maps: { a: { completed: true, bestStars: 3 } } } }),
    ],
    ['wrong-shaped progress', JSON.stringify({ version: PROGRESS_VERSION, progress: [] })],
    ['wrong-shaped maps', JSON.stringify({ version: PROGRESS_VERSION, progress: { maps: 5 } })],
  ])('gives empty progress for %s', (_name, raw) => {
    expect(loadProgress(withRaw(raw))).toEqual(EMPTY_PROGRESS);
  });

  it('gives empty progress when storage is blocked', () => {
    expect(loadProgress(throwing('get'))).toEqual(EMPTY_PROGRESS);
  });

  it('keeps map ids it does not know', () => {
    const loaded = loadProgress(withProgress({ gone: { completed: true, bestStars: 2 } }));
    expect(loaded.maps.gone).toEqual({ completed: true, bestStars: 2 });
  });

  it('drops bad values field by field', () => {
    const loaded = loadProgress(
      withProgress({
        a: { completed: 'yes', bestStars: 2 },
        b: { completed: true, bestStars: 9 },
        c: 'junk',
        d: { completed: true, bestStars: 1 },
      }),
    );
    expect(loaded.maps).toEqual({
      a: { completed: false, bestStars: 2 },
      b: { completed: true, bestStars: 0 },
      d: { completed: true, bestStars: 1 },
    });
  });
});

describe('migrate', () => {
  it('passes the current version through', () => {
    const data = { maps: {} };
    expect(migrate(PROGRESS_VERSION, data)).toBe(data);
  });

  it.each([PROGRESS_VERSION + 1, -1, 1.5, Number.NaN])('rejects version %s', (version) => {
    expect(migrate(version, {})).toBeNull();
  });
});

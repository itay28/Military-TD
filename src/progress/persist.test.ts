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
      progress: { maps: { a: { completed: true, bestStars: 2 } }, hintsDone: false, metEnemies: [] },
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

  it('saves the hints flag when it changes', () => {
    const storage = createMemoryStorage();
    const progress = createPersistedProgress(storage);
    progress.setHintsDone(true);
    expect(saved(storage)).toEqual({ version: PROGRESS_VERSION, progress: { maps: {}, hintsDone: true, metEnemies: [] } });
    expect(createPersistedProgress(storage).get().hintsDone).toBe(true);
    progress.setHintsDone(false);
    expect(saved(storage).progress.hintsDone).toBe(false);
  });

  it('ignores a failed save of the hints flag', () => {
    const progress = createPersistedProgress(throwing('set'));
    expect(() => progress.setHintsDone(true)).not.toThrow();
    expect(progress.get().hintsDone).toBe(true);
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

  it('keeps a saved hints flag, and takes false for a bad one', () => {
    const save = (hintsDone: unknown) =>
      withRaw(JSON.stringify({ version: PROGRESS_VERSION, progress: { maps: {}, hintsDone } }));
    expect(loadProgress(save(true)).hintsDone).toBe(true);
    expect(loadProgress(save(false)).hintsDone).toBe(false);
    expect(loadProgress(save('yes')).hintsDone).toBe(false);
  });

  it('loads a v1 save with its maps, hints done once any map was won', () => {
    const won = { a: { completed: true, bestStars: 2 } };
    expect(loadProgress(withProgress(won, 1))).toEqual({ maps: won, hintsDone: true, metEnemies: [] });
    const notWon = { a: { completed: false, bestStars: 0 } };
    expect(loadProgress(withProgress(notWon, 1))).toEqual({ maps: notWon, hintsDone: false, metEnemies: [] });
    expect(loadProgress(withProgress({}, 1))).toEqual({ maps: {}, hintsDone: false, metEnemies: [] });
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
  it('is at version 2', () => {
    expect(PROGRESS_VERSION).toBe(2);
  });

  it('passes the current version through', () => {
    const data = { maps: {}, hintsDone: true };
    expect(migrate(PROGRESS_VERSION, data)).toBe(data);
  });

  it('adds hintsDone to v1 progress: true once any map was won, maps untouched', () => {
    const won = { maps: { a: { completed: true, bestStars: 3 }, b: { completed: false, bestStars: 0 } } };
    expect(migrate(1, won)).toEqual({ ...won, hintsDone: true });
    expect(migrate(1, { maps: { b: { completed: false, bestStars: 0 } } })).toEqual({
      maps: { b: { completed: false, bestStars: 0 } },
      hintsDone: false,
    });
    expect(migrate(1, { maps: {} })).toEqual({ maps: {}, hintsDone: false });
  });

  it('leaves v1 data that is not progress for sanitize to reject', () => {
    expect(migrate(1, 'junk')).toBe('junk');
    expect(migrate(1, { maps: 5 })).toEqual({ maps: 5, hintsDone: false });
  });

  it.each([PROGRESS_VERSION + 1, -1, 1.5, Number.NaN])('rejects version %s', (version) => {
    expect(migrate(version, {})).toBeNull();
  });

  it('adds metEnemies to v2 progress: every enemy kind in the waves of each map won', () => {
    const won = { maps: { mvp: { completed: true, bestStars: 1 } }, hintsDone: true };
    const migrated = migrate(2, won) as { metEnemies: string[] };
    expect(migrated).toMatchObject(won);
    expect([...migrated.metEnemies].sort()).toEqual(['helicopter', 'infantry', 'jeep', 'tank']);
    expect(migrate(2, { maps: { mvp: { completed: false, bestStars: 0 } }, hintsDone: false })).toMatchObject({
      metEnemies: [],
    });
    expect(migrate(2, { maps: { gone: { completed: true, bestStars: 3 } }, hintsDone: false })).toMatchObject({
      metEnemies: [],
    });
  });
});

describe('metEnemies', () => {
  it('saves and reloads the kinds met, dropping unknown kinds and duplicates', () => {
    const storage = createMemoryStorage();
    createPersistedProgress(storage).recordMet('jeep');
    expect(saved(storage).progress.metEnemies).toEqual(['jeep']);
    expect(createPersistedProgress(storage).get().metEnemies).toEqual(['jeep']);
    const raw = (metEnemies: unknown) =>
      withRaw(JSON.stringify({ version: PROGRESS_VERSION, progress: { maps: {}, hintsDone: false, metEnemies } }));
    expect(loadProgress(raw(['tank', 'dragon', 'tank', 4])).metEnemies).toEqual(['tank']);
    expect(loadProgress(raw('tank')).metEnemies).toEqual([]);
  });
});

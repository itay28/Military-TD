import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { MAPS } from '../data/maps';
import { isRecord, type KeyValueStorage } from '../storage';
import {
  createProgress,
  EMPTY_PROGRESS,
  type MapProgress,
  type Progress,
  type ProgressStore,
  type Stars,
} from './progress';

export const PROGRESS_KEY = 'military-td.progress';
/** Bump when the saved shape changes, and teach `migrate` the step from the old version. */
export const PROGRESS_VERSION = 3;

/** Brings progress saved at `version` up to the current shape. `null` for a version this build can't read. */
export function migrate(version: number, data: unknown): unknown {
  if (!Number.isInteger(version) || version < 0 || version > PROGRESS_VERSION) return null;
  let migrated = data;
  // v1 → v2 adds `hintsDone`: a player who has won a map already knows the first actions, so the hints count as done.
  if (version < 2 && isRecord(migrated)) {
    const maps = isRecord(migrated.maps) ? Object.values(migrated.maps) : [];
    migrated = { ...migrated, hintsDone: maps.some((entry) => isRecord(entry) && entry.completed === true) };
  }
  // v2 → v3 adds `metEnemies` (#408): a map won means every kind in its waves was met.
  if (version < 3 && isRecord(migrated)) {
    const maps = isRecord(migrated.maps) ? migrated.maps : {};
    const won = MAPS.filter((map) => {
      const entry = maps[map.id];
      return isRecord(entry) && entry.completed === true;
    });
    const kinds = new Set(won.flatMap((map) => map.waves.flatMap((wave) => wave.groups.map((group) => group.kind))));
    migrated = { ...migrated, metEnemies: [...kinds] };
  }
  return migrated;
}

const isEnemyKind = (value: unknown): value is EnemyKind =>
  typeof value === 'string' && Object.hasOwn(ENEMY_STATS, value);

const STARS: readonly Stars[] = [0, 1, 2, 3];

/** Keeps each valid field of one map's entry; a bad field takes its default. `null` when it isn't an entry at all. */
function sanitizeMap(data: unknown): MapProgress | null {
  if (!isRecord(data)) return null;
  const { completed, bestStars } = data;
  return {
    completed: typeof completed === 'boolean' ? completed : false,
    bestStars: STARS.find((stars) => stars === bestStars) ?? 0,
  };
}

/** Keeps every map entry that is an object, ids this build doesn't know included (a map may come back). */
function sanitize(data: unknown): Progress {
  if (!isRecord(data) || !isRecord(data.maps)) return EMPTY_PROGRESS;
  const maps: Record<string, MapProgress> = {};
  for (const [id, entry] of Object.entries(data.maps)) {
    const map = sanitizeMap(entry);
    if (map !== null) maps[id] = map;
  }
  const met = Array.isArray(data.metEnemies) ? data.metEnemies.filter(isEnemyKind) : [];
  return { maps, hintsDone: data.hintsDone === true, metEnemies: [...new Set(met)] };
}

/** The saved progress, or empty for anything missing, corrupt, too new or unreadable. Never throws. */
export function loadProgress(storage: KeyValueStorage): Progress {
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    if (raw === null) return EMPTY_PROGRESS;
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || typeof saved.version !== 'number') return EMPTY_PROGRESS;
    const migrated = migrate(saved.version, saved.progress);
    return migrated === null ? EMPTY_PROGRESS : sanitize(migrated);
  } catch {
    return EMPTY_PROGRESS;
  }
}

/** Progress loaded from `storage` and saved back as `{ version, progress }` on every change. A failed save is ignored. */
export function createPersistedProgress(storage: KeyValueStorage): ProgressStore {
  const store = createProgress(loadProgress(storage));
  const save = () => {
    try {
      storage.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, progress: store.get() }));
    } catch {
      // Storage is full or blocked: the progress still holds for this visit.
    }
  };
  return {
    get: store.get,
    recordResult(mapId, stars) {
      store.recordResult(mapId, stars);
      save();
    },
    setHintsDone(done) {
      store.setHintsDone(done);
      save();
    },
    recordMet(kind) {
      const before = store.get();
      store.recordMet(kind);
      if (store.get() !== before) save();
    },
  };
}

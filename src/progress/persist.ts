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
export const PROGRESS_VERSION = 1;

/** Brings progress saved at `version` up to the current shape. `null` for a version this build can't read. */
export function migrate(version: number, data: unknown): unknown {
  if (!Number.isInteger(version) || version < 0 || version > PROGRESS_VERSION) return null;
  // v1 is the first shape: nothing to change yet. Later versions add a step per version here.
  return data;
}

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
  return { maps };
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

/** Progress loaded from `storage` and saved back as `{ version, progress }` on every result. A failed save is ignored. */
export function createPersistedProgress(storage: KeyValueStorage): ProgressStore {
  const store = createProgress(loadProgress(storage));
  return {
    get: store.get,
    recordResult(mapId, stars) {
      store.recordResult(mapId, stars);
      try {
        storage.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, progress: store.get() }));
      } catch {
        // Storage is full or blocked: the progress still holds for this visit.
      }
    },
  };
}

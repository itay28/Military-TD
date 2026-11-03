/** The part of `localStorage` the saved settings and progress use, so tests inject a fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

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

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Subscribes to events by type; read-only side of an Emitter. */
export interface Events<E> {
  /** Calls `listener` for each event of `type`. Returns a function that unsubscribes it. */
  on<K extends keyof E>(type: K, listener: (event: E[K]) => void): () => void;
}

export interface Emitter<E> extends Events<E> {
  emit<K extends keyof E>(type: K, event: E[K]): void;
}

/** A typed event emitter. `E` maps each event type to its payload. */
export function createEmitter<E>(): Emitter<E> {
  const listeners = new Map<keyof E, Set<(event: never) => void>>();
  return {
    on(type, listener) {
      const set = listeners.get(type) ?? new Set();
      listeners.set(type, set);
      set.add(listener);
      return () => set.delete(listener);
    },
    emit(type, event) {
      for (const listener of [...(listeners.get(type) ?? [])]) (listener as (e: typeof event) => void)(event);
    },
  };
}

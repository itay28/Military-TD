export interface ViewSyncOptions<E, V> {
  /** Makes the view for an entity seen for the first time. `update` runs on it right after. */
  create(entity: E): V;
  /** Brings a view in line with its entity; runs on every sync. */
  update(view: V, entity: E): void;
  /** Cleans up the view of an entity that is gone. */
  destroy(view: V): void;
}

export interface ViewSync<E, V> {
  /** Creates, updates and destroys views so there is exactly one per entity in `entities`. */
  sync(entities: readonly E[]): void;
  get(id: number): V | undefined;
  readonly size: number;
}

/** Keeps one display object per sim entity, keyed by entity id. No Phaser in it, so it can be unit tested. */
export function createViewSync<E extends { readonly id: number }, V>({
  create,
  update,
  destroy,
}: ViewSyncOptions<E, V>): ViewSync<E, V> {
  const views = new Map<number, V>();
  return {
    sync(entities) {
      const seen = new Set<number>();
      for (const entity of entities) {
        seen.add(entity.id);
        let view = views.get(entity.id);
        if (view === undefined) {
          view = create(entity);
          views.set(entity.id, view);
        }
        update(view, entity);
      }
      for (const [id, view] of views) {
        if (seen.has(id)) continue;
        destroy(view);
        views.delete(id);
      }
    },
    get: (id) => views.get(id),
    get size() {
      return views.size;
    },
  };
}

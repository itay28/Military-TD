import { describe, expect, it } from 'vitest';
import { createViewSync } from './viewSync';

interface Entity {
  id: number;
  hp: number;
}
interface View {
  id: number;
  hp: number;
  destroyed: boolean;
}

/** A view sync whose views are plain records. `created` holds each view made, by entity id; `log` what it did. */
function setup() {
  const log: string[] = [];
  const created = new Map<number, View>();
  const views = createViewSync<Entity, View>({
    create: (entity) => {
      log.push(`create ${entity.id}`);
      const view = { id: entity.id, hp: entity.hp, destroyed: false };
      created.set(entity.id, view);
      return view;
    },
    update: (view, entity) => {
      log.push(`update ${entity.id}`);
      view.hp = entity.hp;
    },
    destroy: (view) => {
      log.push(`destroy ${view.id}`);
      view.destroyed = true;
    },
  });
  return { views, created, log };
}

describe('createViewSync', () => {
  it('creates a view for each new entity id', () => {
    const { views, created, log } = setup();
    views.sync([
      { id: 1, hp: 30 },
      { id: 2, hp: 30 },
    ]);
    expect(log).toEqual(['create 1', 'update 1', 'create 2', 'update 2']);
    expect([...created.keys()]).toEqual([1, 2]);
  });

  it('updates existing views instead of recreating them', () => {
    const { views, created, log } = setup();
    views.sync([{ id: 1, hp: 30 }]);
    log.length = 0;
    views.sync([{ id: 1, hp: 20 }]);
    expect(log).toEqual(['update 1']);
    expect(created.get(1)?.hp).toBe(20);
  });

  it('destroys views whose entity disappeared', () => {
    const { views, created, log } = setup();
    views.sync([
      { id: 1, hp: 30 },
      { id: 2, hp: 30 },
    ]);
    log.length = 0;
    views.sync([{ id: 2, hp: 30 }]);
    expect(log).toEqual(['update 2', 'destroy 1']);
    expect(created.get(1)?.destroyed).toBe(true);
    expect(created.get(2)?.destroyed).toBe(false);
    log.length = 0;
    views.sync([{ id: 2, hp: 30 }]);
    expect(log).toEqual(['update 2']);
  });

  it('keeps each view with its entity when the order changes', () => {
    const { views, created, log } = setup();
    views.sync([
      { id: 1, hp: 30 },
      { id: 2, hp: 25 },
    ]);
    log.length = 0;
    views.sync([
      { id: 2, hp: 10 },
      { id: 1, hp: 5 },
    ]);
    expect(log).toEqual(['update 2', 'update 1']);
    expect([created.get(1)?.hp, created.get(2)?.hp]).toEqual([5, 10]);
  });

  it('without an update callback, only creates and destroys', () => {
    const log: string[] = [];
    const views = createViewSync<Entity, number>({
      create: (entity) => {
        log.push(`create ${entity.id}`);
        return entity.id;
      },
      destroy: (id) => log.push(`destroy ${id}`),
    });
    views.sync([{ id: 1, hp: 30 }]);
    views.sync([{ id: 1, hp: 20 }]);
    views.sync([]);
    expect(log).toEqual(['create 1', 'destroy 1']);
  });
});

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

/** A view sync whose views are plain records, with a log of what it did. */
function setup() {
  const log: string[] = [];
  const views = createViewSync<Entity, View>({
    create: (entity) => {
      log.push(`create ${entity.id}`);
      return { id: entity.id, hp: entity.hp, destroyed: false };
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
  return { views, log };
}

describe('createViewSync', () => {
  it('creates a view for each new entity id', () => {
    const { views, log } = setup();
    views.sync([
      { id: 1, hp: 30 },
      { id: 2, hp: 30 },
    ]);
    expect(log).toEqual(['create 1', 'update 1', 'create 2', 'update 2']);
    expect(views.size).toBe(2);
    expect(views.get(2)?.id).toBe(2);
  });

  it('updates existing views instead of recreating them', () => {
    const { views, log } = setup();
    views.sync([{ id: 1, hp: 30 }]);
    const view = views.get(1);
    log.length = 0;
    views.sync([{ id: 1, hp: 20 }]);
    expect(log).toEqual(['update 1']);
    expect(views.get(1)).toBe(view);
    expect(view?.hp).toBe(20);
  });

  it('destroys views whose entity disappeared', () => {
    const { views, log } = setup();
    views.sync([
      { id: 1, hp: 30 },
      { id: 2, hp: 30 },
    ]);
    const gone = views.get(1);
    log.length = 0;
    views.sync([{ id: 2, hp: 30 }]);
    expect(log).toEqual(['update 2', 'destroy 1']);
    expect(gone?.destroyed).toBe(true);
    expect(views.get(1)).toBeUndefined();
    expect(views.size).toBe(1);
  });

  it('keeps each view with its entity when the order changes', () => {
    const { views } = setup();
    views.sync([
      { id: 1, hp: 30 },
      { id: 2, hp: 25 },
    ]);
    const [one, two] = [views.get(1), views.get(2)];
    views.sync([
      { id: 2, hp: 10 },
      { id: 1, hp: 5 },
    ]);
    expect(views.get(1)).toBe(one);
    expect(views.get(2)).toBe(two);
    expect([one?.hp, two?.hp]).toEqual([5, 10]);
  });
});

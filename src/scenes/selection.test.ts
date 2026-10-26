import { describe, expect, it } from 'vitest';
import { TOWER_STATS } from '../data/towers';
import type { Tower } from '../sim/towers';
import { resolveClick } from './selection';

const tower = (id: number, col: number, row: number): Tower => ({
  ...TOWER_STATS.rifleNest,
  id,
  kind: 'rifleNest',
  tile: { col, row },
  cooldownMs: 0,
  level: 1,
  spent: 50,
});

const TOWERS = [tower(1, 2, 2), tower(2, 4, 2)];
const EMPTY = { col: 0, row: 4 };

describe('resolveClick', () => {
  it('a click on a tower selects it', () => {
    expect(resolveClick(TOWERS, undefined, { col: 2, row: 2 })).toEqual({ type: 'select', towerId: 1 });
  });

  it('a click on another tower while one is selected selects that one', () => {
    expect(resolveClick(TOWERS, 1, { col: 4, row: 2 })).toEqual({ type: 'select', towerId: 2 });
  });

  it('a click on the selected tower keeps it selected', () => {
    expect(resolveClick(TOWERS, 1, { col: 2, row: 2 })).toEqual({ type: 'select', towerId: 1 });
  });

  it('a click on an empty tile while a tower is selected only deselects', () => {
    expect(resolveClick(TOWERS, 1, EMPTY)).toEqual({ type: 'deselect' });
  });

  it('a click on an empty tile with nothing selected places a tower there', () => {
    expect(resolveClick(TOWERS, undefined, EMPTY)).toEqual({ type: 'place', tile: EMPTY });
  });
});

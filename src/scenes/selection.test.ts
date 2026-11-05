import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from '../data/enemies';
import { TOWER_STATS } from '../data/towers';
import type { Enemy } from '../sim/enemies';
import type { Tower } from '../sim/towers';
import { enemyAt, resolveClick } from './selection';

const tower = (id: number, col: number, row: number): Tower => ({
  ...TOWER_STATS.rifleNest,
  id,
  kind: 'rifleNest',
  tile: { col, row },
  cooldownMs: 0,
  heading: 0,
  level: 1,
  spent: 50,
});

const TOWERS = [tower(1, 2, 2), tower(2, 4, 2)];
const EMPTY = { col: 0, row: 4 };

describe('resolveClick', () => {
  it('a click on a tower selects it', () => {
    expect(resolveClick(TOWERS, undefined, { col: 2, row: 2 }, 'rifleNest')).toEqual({ type: 'select', towerId: 1 });
  });

  it('a click on another tower while one is selected selects that one', () => {
    expect(resolveClick(TOWERS, 1, { col: 4, row: 2 }, undefined)).toEqual({ type: 'select', towerId: 2 });
  });

  it('a click on the selected tower keeps it selected', () => {
    expect(resolveClick(TOWERS, 1, { col: 2, row: 2 }, undefined)).toEqual({ type: 'select', towerId: 1 });
  });

  it('a click on an empty tile while a tower is selected only deselects', () => {
    expect(resolveClick(TOWERS, 1, EMPTY, 'rifleNest')).toEqual({ type: 'deselect' });
  });

  it('a click on an empty tile with a build kind selected places a tower there', () => {
    expect(resolveClick(TOWERS, undefined, EMPTY, 'rifleNest')).toEqual({
      type: 'place',
      kind: 'rifleNest',
      tile: EMPTY,
    });
  });

  it('a click on an empty tile with no build kind selected does nothing', () => {
    expect(resolveClick(TOWERS, undefined, EMPTY, undefined)).toEqual({ type: 'none' });
  });

  it('a click on a tower selects it even with no build kind selected', () => {
    expect(resolveClick(TOWERS, undefined, { col: 4, row: 2 }, undefined)).toEqual({ type: 'select', towerId: 2 });
  });
});

/** An Infantry (drawn radius 9 px) at world pixel (x, y): positions are in tiles of 48 px. */
const infantry = (id: number, x: number, y: number): Enemy => ({
  ...ENEMY_STATS.infantry,
  id,
  kind: 'infantry',
  hp: 30,
  distance: 0,
  position: { x: x / 48, y: y / 48 },
});

describe('enemyAt', () => {
  const ENEMIES = [infantry(1, 100, 100), infantry(2, 130, 100)];

  it('finds the enemy whose drawn shape holds the point', () => {
    expect(enemyAt(ENEMIES, { x: 105, y: 100 }, 0)?.id).toBe(1);
  });

  it('finds nothing outside every enemy', () => {
    expect(enemyAt(ENEMIES, { x: 100, y: 140 }, 0)).toBeUndefined();
  });

  it('widens a small enemy to the minimum hit radius', () => {
    expect(enemyAt(ENEMIES, { x: 100, y: 115 }, 0)).toBeUndefined();
    expect(enemyAt(ENEMIES, { x: 100, y: 115 }, 16)?.id).toBe(1);
  });

  it('picks the nearest when hit circles overlap', () => {
    expect(enemyAt(ENEMIES, { x: 120, y: 100 }, 16)?.id).toBe(2);
  });
});

describe('resolveClick with enemies', () => {
  it('a click on an enemy inspects it', () => {
    expect(resolveClick(TOWERS, undefined, EMPTY, 'rifleNest', { enemyId: 7 })).toEqual({
      type: 'inspect',
      enemyId: 7,
    });
  });

  it('a click on an enemy while a tower is selected inspects it', () => {
    expect(resolveClick(TOWERS, 1, EMPTY, undefined, { enemyId: 7 })).toEqual({ type: 'inspect', enemyId: 7 });
  });

  it('a tower on the tile wins over an enemy under the point', () => {
    expect(resolveClick(TOWERS, undefined, { col: 2, row: 2 }, undefined, { enemyId: 7 })).toEqual({
      type: 'select',
      towerId: 1,
    });
  });

  it('a click on an empty tile while an enemy card is open only closes it', () => {
    expect(resolveClick(TOWERS, undefined, EMPTY, 'rifleNest', { cardOpen: true })).toEqual({ type: 'deselect' });
  });
});

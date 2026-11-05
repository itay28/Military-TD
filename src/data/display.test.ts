import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, ENEMY_NAMES, ENEMY_WEAKNESS, TILE_PX, TOWER_NAMES, TOWER_ROLES } from './display';
import { ENEMY_STATS, type EnemyKind } from './enemies';
import { GRID_COLS, GRID_ROWS } from './grid';
import { TOWER_STATS, type TowerKind } from './towers';

describe('display', () => {
  it('canvas is 768×480 from a 16×10 grid of 48 px tiles', () => {
    expect([GRID_COLS, GRID_ROWS, TILE_PX]).toEqual([16, 10, 48]);
    expect([CANVAS_WIDTH, CANVAS_HEIGHT]).toEqual([768, 480]);
  });
});

describe('names and role lines', () => {
  it.each(Object.keys(TOWER_STATS) as TowerKind[])('tower %s has a name and a role line', (kind) => {
    expect(TOWER_NAMES[kind]?.trim()).toBeTruthy();
    expect(TOWER_ROLES[kind]?.trim()).toBeTruthy();
  });

  it.each(Object.keys(ENEMY_STATS) as EnemyKind[])('enemy %s has a name and a line on what hurts it', (kind) => {
    expect(ENEMY_NAMES[kind]?.trim()).toBeTruthy();
    expect(ENEMY_WEAKNESS[kind]?.trim()).toBeTruthy();
  });
});

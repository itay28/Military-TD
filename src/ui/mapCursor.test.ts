// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Phase } from '../sim/game';
import { createMap, type Tile } from '../sim/map';
import type { Enemy } from '../sim/enemies';
import type { Tower } from '../sim/towers';
import { cursorCommand, describeTile, enemiesOn, mountMapKeys, moveCursor, type CursorContext } from './mapCursor';

/** A 6×4 map whose Path runs along row 1. */
const MAP = createMap({
  id: 'test',
  cols: 6,
  rows: 4,
  waypoints: [
    { col: 0, row: 1 },
    { col: 5, row: 1 },
  ],
});

const key = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
const NONE: CursorContext = { kindPicked: false, towerSelected: false };
const PICKED: CursorContext = { kindPicked: true, towerSelected: false };
const SELECTED: CursorContext = { kindPicked: false, towerSelected: true };

describe('cursorCommand', () => {
  it.each([
    ['ArrowUp', 0, -1],
    ['ArrowDown', 0, 1],
    ['ArrowLeft', -1, 0],
    ['ArrowRight', 1, 0],
  ] as const)('%s moves one tile, whatever is picked', (name, dCol, dRow) => {
    for (const context of [NONE, PICKED, SELECTED])
      expect(cursorCommand(key(name), context)).toEqual({ type: 'move', dCol, dRow });
  });

  it('Shift+arrow moves 4 tiles', () => {
    expect(cursorCommand(key('ArrowRight', { shiftKey: true }), NONE)).toEqual({ type: 'move', dCol: 4, dRow: 0 });
    expect(cursorCommand(key('ArrowUp', { shiftKey: true }), PICKED)).toEqual({ type: 'move', dCol: 0, dRow: -4 });
  });

  it.each([
    ['w', 0, -1],
    ['a', -1, 0],
    ['s', 0, 1],
    ['D', 1, 0],
  ] as const)('%s moves when nothing is picked', (name, dCol, dRow) => {
    expect(cursorCommand(key(name), NONE)).toEqual({ type: 'move', dCol, dRow });
  });

  it('ignores WASD with a build kind or a tower picked, so S still sells', () => {
    for (const name of ['w', 'a', 's', 'd']) {
      expect(cursorCommand(key(name), PICKED)).toBeUndefined();
      expect(cursorCommand(key(name), SELECTED)).toBeUndefined();
    }
  });

  it('Enter activates; Space activates only while a kind is picked, else it stays Start Wave', () => {
    expect(cursorCommand(key('Enter'), NONE)).toEqual({ type: 'activate' });
    expect(cursorCommand(key('Enter'), SELECTED)).toEqual({ type: 'activate' });
    expect(cursorCommand(key(' '), PICKED)).toEqual({ type: 'activate' });
    expect(cursorCommand(key(' '), NONE)).toBeUndefined();
    expect(cursorCommand(key(' '), SELECTED)).toBeUndefined();
  });

  it('ignores keys with Ctrl, Alt or Meta, a held-down Enter, and other keys', () => {
    expect(cursorCommand(key('ArrowUp', { ctrlKey: true }), NONE)).toBeUndefined();
    expect(cursorCommand(key('ArrowUp', { altKey: true }), NONE)).toBeUndefined();
    expect(cursorCommand(key('Enter', { metaKey: true }), NONE)).toBeUndefined();
    expect(cursorCommand(key('Enter', { repeat: true }), NONE)).toBeUndefined();
    expect(cursorCommand(key('u'), NONE)).toBeUndefined();
  });

  it('lets a held-down arrow keep moving', () => {
    expect(cursorCommand(key('ArrowLeft', { repeat: true }), NONE)).toEqual({ type: 'move', dCol: -1, dRow: 0 });
  });
});

describe('moveCursor', () => {
  it('moves by the step and stays on the grid', () => {
    expect(moveCursor({ col: 2, row: 2 }, 1, -1, MAP)).toEqual({ col: 3, row: 1 });
    expect(moveCursor({ col: 2, row: 2 }, 4, 4, MAP)).toEqual({ col: 5, row: 3 });
    expect(moveCursor({ col: 1, row: 0 }, -4, -4, MAP)).toEqual({ col: 0, row: 0 });
  });
});

const tower = (tile: Tile, level = 1) => ({ id: 1, kind: 'rifleNest', tile, level }) as unknown as Tower;
const enemy = (id: number, kind: string, x: number, y: number) =>
  ({ id, kind, position: { x, y } }) as unknown as Enemy;

describe('describeTile', () => {
  const state = (towers: Tower[] = [], enemies: Enemy[] = []) => ({ map: MAP, towers, enemies });

  it('names a free tile, a Path tile and an unbuildable one, counting from 1, column first', () => {
    expect(describeTile(state(), { col: 4, row: 2 })).toBe('Tile 5, 3: free');
    expect(describeTile(state(), { col: 0, row: 1 })).toBe('Tile 1, 2: path');
    const fenced = createMap({ ...MAP, buildable: [{ col: 0, row: 0 }] });
    expect(describeTile({ map: fenced, towers: [], enemies: [] }, { col: 3, row: 3 })).toBe('Tile 4, 4: not buildable');
  });

  it('names the tower on the tile and its level', () => {
    expect(describeTile(state([tower({ col: 4, row: 2 }, 2)]), { col: 4, row: 2 })).toBe('Rifle Nest, level 2');
  });

  it('adds the enemies on the tile', () => {
    const enemies = [enemy(1, 'infantry', 2.5, 1.5), enemy(2, 'jeep', 2.1, 1.9), enemy(3, 'jeep', 3.5, 1.5)];
    expect(describeTile(state([], enemies), { col: 2, row: 1 })).toBe('Tile 3, 2: path, Infantry, Jeep');
  });
});

describe('enemiesOn', () => {
  it('lists the enemies whose position is on the tile, nearest its centre first', () => {
    const enemies = [enemy(1, 'infantry', 2.1, 1.1), enemy(2, 'jeep', 2.5, 1.4), enemy(3, 'jeep', 3.5, 1.5)];
    expect(enemiesOn(enemies, { col: 2, row: 1 }).map((e) => e.id)).toEqual([2, 1]);
  });
});

describe('mountMapKeys', () => {
  let mapRoot: HTMLElement;
  let game: { state: { phase: Phase; map: typeof MAP } };
  let context: { kindPicked: boolean; towerSelected: boolean };
  let onMove: Mock<(tile: Tile) => void>;
  let onActivate: Mock<(tile: Tile) => void>;
  let keys: ReturnType<typeof mountMapKeys>;
  const status = () => mapRoot.querySelector('[aria-live]')!;

  beforeEach(() => {
    document.body.replaceChildren();
    mapRoot = document.createElement('div');
    const button = document.createElement('button');
    document.body.append(button, mapRoot);
    game = { state: { phase: 'build', map: MAP } };
    context = { kindPicked: false, towerSelected: false };
    onMove = vi.fn();
    onActivate = vi.fn();
    keys = mountMapKeys(mapRoot, game, {
      start: { col: 2, row: 2 },
      kindPicked: () => context.kindPicked,
      towerSelected: () => context.towerSelected,
      describe: ({ col, row }) => `at ${col},${row}`,
      onMove,
      onActivate,
    });
  });
  afterEach(() => keys.destroy());

  it('makes the map a labelled focus stop with a polite live region', () => {
    expect(mapRoot.tabIndex).toBe(0);
    expect(mapRoot.getAttribute('role')).toBe('application');
    expect(mapRoot.getAttribute('aria-label')).toBe('Map');
    expect(status().getAttribute('aria-live')).toBe('polite');
  });

  it('shows the cursor and announces its tile when the map gets focus, and hides it on blur', () => {
    expect(keys.shown).toBe(false);
    mapRoot.focus();
    expect(keys.shown).toBe(true);
    expect(status().textContent).toBe('at 2,2');
    mapRoot.blur();
    expect(keys.shown).toBe(false);
  });

  it('does not show the cursor when a mouse press focused the map', () => {
    mapRoot.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    mapRoot.focus();
    expect(keys.shown).toBe(false);
    mapRoot.dispatchEvent(key('ArrowLeft'));
    expect(keys.shown).toBe(true);
  });

  it('moves the cursor with the arrows, announces the tile and prevents the default', () => {
    mapRoot.focus();
    const event = key('ArrowRight', { shiftKey: true });
    mapRoot.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(keys.cursor).toEqual({ col: 5, row: 2 });
    expect(onMove).toHaveBeenLastCalledWith({ col: 5, row: 2 });
    expect(status().textContent).toBe('at 5,2');
  });

  it('activates the cursor tile on Enter', () => {
    mapRoot.focus();
    mapRoot.dispatchEvent(key('Enter'));
    expect(onActivate).toHaveBeenCalledWith({ col: 2, row: 2 });
  });

  it('leaves keys it does not handle alone', () => {
    mapRoot.focus();
    const event = key(' ');
    mapRoot.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('takes a key pressed while nothing has focus, and focuses the map', () => {
    const event = key('ArrowDown');
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(mapRoot);
    expect(keys.cursor).toEqual({ col: 2, row: 3 });
  });

  it('leaves keys on other focused elements alone', () => {
    const button = document.querySelector('button')!;
    button.focus();
    const event = key('Enter');
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does nothing once the game is over', () => {
    mapRoot.focus();
    game.state.phase = 'defeat';
    mapRoot.dispatchEvent(key('Enter'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('stops listening and removes the live region on destroy', () => {
    keys.destroy();
    mapRoot.focus();
    mapRoot.dispatchEvent(key('Enter'));
    expect(onActivate).not.toHaveBeenCalled();
    expect(mapRoot.querySelector('[aria-live]')).toBeNull();
  });
});

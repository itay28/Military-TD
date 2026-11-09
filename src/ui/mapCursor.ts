import { ENEMY_NAMES, TOWER_NAMES } from '../data/display';
import type { Enemy } from '../sim/enemies';
import { isGameOver, type GameState } from '../sim/game';
import type { GameMap, Tile } from '../sim/map';
import { towerAt, type Tower } from '../sim/towers';
import { isTypingTarget } from './keymap';

// The map cursor (#356): a tile picked with the keyboard, so the game plays without a mouse or touch. Pure DOM and
// math here; GameScene draws the highlight, follows it with the camera and acts on it through the same path as a tap.

/** What a key does to the map cursor. */
export type CursorCommand =
  { readonly type: 'move'; readonly dCol: number; readonly dRow: number } | { readonly type: 'activate' };

/** What is picked now, which decides what WASD and Space mean. */
export interface CursorContext {
  readonly kindPicked: boolean;
  readonly towerSelected: boolean;
}

/** Shift+arrow moves this many tiles. */
export const CURSOR_FAST_STEP = 4;

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
const WASD: Readonly<Record<string, readonly [number, number]>> = { w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0] };

/**
 * The cursor command a keydown asks for, or undefined. Arrows always move (Shift: 4 tiles). WASD moves only with no
 * build kind and no tower picked, so S still sells the selected tower. Enter activates; Space activates only while a
 * kind is picked, and otherwise stays Start Wave.
 */
export function cursorCommand(
  event: KeyboardEvent,
  { kindPicked, towerSelected }: CursorContext,
): CursorCommand | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey || isTypingTarget(event.target)) return undefined;
  const step = ARROWS[event.key] ?? (kindPicked || towerSelected ? undefined : WASD[event.key.toLowerCase()]);
  if (step) {
    const by = event.shiftKey && ARROWS[event.key] ? CURSOR_FAST_STEP : 1;
    return { type: 'move', dCol: step[0] * by, dRow: step[1] * by };
  }
  if (event.repeat) return undefined;
  if (event.key === 'Enter' || (event.key === ' ' && kindPicked)) return { type: 'activate' };
  return undefined;
}

/** `tile` moved by `dCol`, `dRow`, kept on the grid. */
export function moveCursor(
  tile: Tile,
  dCol: number,
  dRow: number,
  { cols, rows }: Pick<GameMap, 'cols' | 'rows'>,
): Tile {
  const clamp = (value: number, size: number) => Math.min(Math.max(value, 0), size - 1);
  return { col: clamp(tile.col + dCol, cols), row: clamp(tile.row + dRow, rows) };
}

/** The enemies standing on `tile`, nearest its centre first. */
export function enemiesOn(enemies: readonly Enemy[], { col, row }: Tile): Enemy[] {
  const away = ({ position: { x, y } }: Enemy) => (x - col - 0.5) ** 2 + (y - row - 0.5) ** 2;
  return enemies
    .filter(({ position: { x, y } }) => Math.floor(x) === col && Math.floor(y) === row)
    .sort((a, b) => away(a) - away(b));
}

/**
 * What the screen reader says about the cursor's tile: the tower there ("Rifle Nest, level 2"), or the tile counted
 * from 1, column first, and whether it takes a tower ("Tile 5, 3: free"), plus the enemies on it.
 */
export function describeTile(
  { map, towers, enemies }: Pick<GameState, 'map' | 'towers' | 'enemies'>,
  tile: Tile,
): string {
  const tower: Tower | undefined = towerAt(towers, tile);
  const what = tower
    ? `${TOWER_NAMES[tower.kind]}, level ${tower.level}`
    : `Tile ${tile.col + 1}, ${tile.row + 1}: ${map.isPath(tile) ? 'path' : map.isBuildable(tile) ? 'free' : 'not buildable'}`;
  return [what, ...enemiesOn(enemies, tile).map((enemy) => ENEMY_NAMES[enemy.kind])].join(', ');
}

export interface MapKeysGame {
  readonly state: Pick<GameState, 'phase'> & { readonly map: Pick<GameMap, 'cols' | 'rows'> };
}

export interface MapKeysOptions {
  /** Where the cursor starts. */
  readonly start: Tile;
  readonly kindPicked: () => boolean;
  readonly towerSelected: () => boolean;
  /** The live region's text for a tile (`describeTile`). */
  readonly describe: (tile: Tile) => string;
  /** The cursor moved to `tile`. */
  readonly onMove: (tile: Tile) => void;
  /** Enter (or Space with a kind picked) on `tile`: what a tap there does. */
  readonly onActivate: (tile: Tile) => void;
}

export interface MapKeys {
  readonly cursor: Tile;
  /** Whether to draw the cursor: the map has keyboard focus (not focus from a mouse press). */
  readonly shown: boolean;
  /** Says the cursor's tile again, after what is on it changed. */
  announce(): void;
  destroy(): void;
}

/** Visually hidden, still read by screen readers. */
const HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

/**
 * Makes `mapRoot` a focus stop for the map cursor, with a polite live region naming the cursor's tile. Handles keys
 * on the map, and on `<body>` when nothing has focus (that key focuses the map). A handled key's default is
 * prevented, so the shortcuts skip it. Does nothing once the game is over; the pause menu stops keys before this.
 */
export function mountMapKeys(mapRoot: HTMLElement, game: MapKeysGame, options: MapKeysOptions): MapKeys {
  const doc = mapRoot.ownerDocument;
  const body = doc.body;
  mapRoot.tabIndex = 0;
  mapRoot.setAttribute('role', 'application');
  mapRoot.setAttribute('aria-label', 'Map');
  const status = doc.createElement('div');
  status.setAttribute('aria-live', 'polite');
  status.dataset.testid = 'map-cursor-status';
  status.setAttribute('style', HIDDEN_STYLE);
  mapRoot.append(status);

  let cursor = options.start;
  let shown = false;
  let pressed = false;
  const announce = () => {
    status.textContent = options.describe(cursor);
  };

  const onPointerDown = () => {
    pressed = true;
    shown = false;
  };
  const onFocus = () => {
    shown = !pressed;
    pressed = false;
    if (shown) announce();
  };
  const onBlur = () => {
    shown = false;
    pressed = false;
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.target !== mapRoot && event.target !== body) return;
    if (event.defaultPrevented || isGameOver(game.state.phase)) return;
    const command = cursorCommand(event, {
      kindPicked: options.kindPicked(),
      towerSelected: options.towerSelected(),
    });
    if (!command) return;
    event.preventDefault();
    if (doc.activeElement !== mapRoot) mapRoot.focus({ preventScroll: true });
    shown = true;
    if (command.type === 'move') {
      cursor = moveCursor(cursor, command.dCol, command.dRow, game.state.map);
      options.onMove(cursor);
    } else options.onActivate(cursor);
    announce();
  };
  mapRoot.addEventListener('pointerdown', onPointerDown);
  mapRoot.addEventListener('focus', onFocus);
  mapRoot.addEventListener('blur', onBlur);
  // On <body>, which a key on the map bubbles through too: before the shortcuts' and build bar's listeners on the
  // document, so they see the prevented default.
  body.addEventListener('keydown', onKey);
  return {
    get cursor() {
      return cursor;
    },
    get shown() {
      return shown;
    },
    announce,
    destroy: () => {
      mapRoot.removeEventListener('pointerdown', onPointerDown);
      mapRoot.removeEventListener('focus', onFocus);
      mapRoot.removeEventListener('blur', onBlur);
      body.removeEventListener('keydown', onKey);
      status.remove();
    },
  };
}

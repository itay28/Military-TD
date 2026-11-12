import type { EnemyKind } from './enemies';
import type { Position, Tile } from '../sim/map';
import type { TowerKind } from './towers';

/** A tower the menu clip places before it starts, raised to `level`. */
export interface ClipTower {
  readonly kind: TowerKind;
  readonly tile: Tile;
  readonly level: number;
}

/** One enemy of the clip's spawn cycle: whether the towers may kill it, or it drives or walks off the map. */
export interface ClipSpawn {
  readonly kind: EnemyKind;
  readonly dies: boolean;
}

/**
 * The camera's slow pan, between two points in tiles (the view's centre), out and back once a loop. `zoom` multiplies
 * the zoom that fills the screen with the map, so there is room to pan.
 */
export interface ClipPan {
  readonly from: Position;
  readonly to: Position;
  readonly zoom: number;
}

/**
 * The battle recorded for the video behind the Main menu and the Level select (#568). It repeats every `loopMs`: the
 * spawns come every `spawnEveryMs` (which divides it) round `spawns` (whose length divides the spawns per loop), the
 * pan goes out and back over it, and nothing else changes from loop to loop. `warmUpMs` (whole loops) is played before
 * the first frame, so the field is already in that repeating state.
 */
export interface MenuClip {
  readonly mapId: string;
  readonly towers: readonly ClipTower[];
  readonly loopMs: number;
  readonly spawnEveryMs: number;
  readonly spawns: readonly ClipSpawn[];
  /** Each enemy that doesn't die gets this many times its HP, so the towers' shots hardly touch it. */
  readonly survivorHpScale: number;
  readonly warmUpMs: number;
  readonly pan: ClipPan;
  /** Frames a second of the video. */
  readonly fps: number;
}

const at = (kind: TowerKind, col: number, row: number, level = 1): ClipTower => ({ kind, tile: { col, row }, level });
const spawn = (kind: EnemyKind, dies = false): ClipSpawn => ({ kind, dies });

/** Training Ground's defence, a calm column of mixed enemies, and a few kills (`npm run menu:clip` records it). */
export const MENU_CLIP: MenuClip = {
  mapId: 'mvp',
  towers: [
    at('rifleNest', 5, 4, 2),
    at('aaGun', 10, 4),
    at('cannon', 6, 8),
    at('mortar', 10, 0),
    at('rifleNest', 1, 3),
  ],
  loopMs: 48_000,
  spawnEveryMs: 4000,
  spawns: [
    spawn('infantry', true),
    spawn('jeep'),
    spawn('infantry'),
    spawn('helicopter', true),
    spawn('apc'),
    spawn('infantry', true),
    spawn('tank'),
    spawn('jeep', true),
    spawn('infantry'),
    spawn('helicopter'),
    spawn('infantry', true),
    spawn('jeep'),
  ],
  survivorHpScale: 1e6,
  warmUpMs: 96_000,
  pan: { from: { x: 4, y: 4 }, to: { x: 12, y: 5 }, zoom: 1.4 },
  fps: 30,
};

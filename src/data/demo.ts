import type { Position, Tile } from '../sim/map';
import type { TowerKind } from './towers';

/** A tower the demo places before it starts, raised to `level`. */
export interface DemoTower {
  readonly kind: TowerKind;
  readonly tile: Tile;
  readonly level: number;
}

/**
 * The demo camera's slow pan, between two points in tiles (the view's centre), out and back over `periodMs`. `zoom`
 * multiplies the zoom that fills the screen with the map, so there is room to pan.
 */
export interface DemoPan {
  readonly from: Position;
  readonly to: Position;
  readonly periodMs: number;
  readonly zoom: number;
}

/**
 * The battle that plays behind the main menu on one map (#402): towers held at strong points, the map's own waves, and
 * a camera pan. `preRollMs` of game time is played before the first frame, so the field is already busy (and is the
 * still frame with reduced motion): each map's is a moment mid-wave.
 */
export interface DemoScript {
  readonly mapId: string;
  readonly towers: readonly DemoTower[];
  readonly preRollMs: number;
  readonly pan: DemoPan;
}

const PAN = { periodMs: 60_000, zoom: 1.4 } as const;
const at = (kind: TowerKind, col: number, row: number, level = 1): DemoTower => ({ kind, tile: { col, row }, level });

/** One script per map, in Level select order; each time the demo starts it plays the next. */
export const DEMO_SCRIPTS: readonly DemoScript[] = [
  {
    mapId: 'mvp',
    towers: [
      at('rifleNest', 5, 4, 2),
      at('aaGun', 10, 4),
      at('cannon', 6, 8),
      at('mortar', 10, 0),
      at('rifleNest', 1, 3),
    ],
    preRollMs: 45_000,
    pan: { ...PAN, from: { x: 4, y: 4 }, to: { x: 12, y: 5 } },
  },
  {
    mapId: 'switchback',
    towers: [
      at('rifleNest', 4, 4, 2),
      at('aaGun', 8, 5),
      at('cannon', 12, 5),
      at('mortar', 8, 0),
      at('rifleNest', 4, 8),
    ],
    preRollMs: 25_000,
    pan: { ...PAN, from: { x: 4, y: 4 }, to: { x: 11, y: 6 } },
  },
  {
    mapId: 'serpentine',
    towers: [
      at('rifleNest', 2, 4, 2),
      at('aaGun', 5, 4),
      at('cannon', 8, 4),
      at('mortar', 6, 9),
      at('rifleNest', 11, 5),
    ],
    preRollMs: 30_000,
    pan: { ...PAN, from: { x: 3, y: 3 }, to: { x: 12, y: 6 } },
  },
  {
    mapId: 'hairpin',
    towers: [
      at('rifleNest', 6, 4, 2),
      at('aaGun', 9, 5),
      at('cannon', 4, 2),
      at('mortar', 8, 0),
      at('rifleNest', 5, 8),
    ],
    preRollMs: 60_000,
    pan: { ...PAN, from: { x: 3, y: 6 }, to: { x: 12, y: 3 } },
  },
];

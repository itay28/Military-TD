import type { PlaceTowerRefusal } from '../sim/game';
import type { EnemyKind } from './enemies';
import { GRID_COLS, GRID_ROWS } from './grid';
import type { TowerKind } from './towers';

/** Size of one tile in pixels. Only Scenes convert tiles to pixels. */
export const TILE_PX = 48;

export const CANVAS_WIDTH = GRID_COLS * TILE_PX;
export const CANVAS_HEIGHT = GRID_ROWS * TILE_PX;

/** How the map is drawn with shapes (before the v0.4 tileset). */
export const MAP_STYLE = {
  path: 0xc2a46b, // sand
  buildable: 0x5b6b3a, // olive
  grid: { color: 0x000000, alpha: 0.15, width: 1 },
} as const;

/** Enemies as circles, by kind (before the v0.4 sprites). Radius in pixels. */
export const ENEMY_STYLE = {
  infantry: { radius: 9, color: 0x9e3b2c }, // brick red
} as const satisfies Record<EnemyKind, { radius: number; color: number }>;

/** The HP bar above each enemy. `gap` is the space between the bar and the top of the circle. */
export const HP_BAR = { width: 24, height: 4, gap: 4, back: 0x1a1a1a, backAlpha: 0.7, fill: 0x6fcf4f } as const;

/** Towers as outlined squares, by kind. Size in pixels, less than a tile so the grid shows around it. */
export const TOWER_STYLE = {
  rifleNest: { size: 32, fill: 0x3b4252, outline: 0xe5e1cf, outlineWidth: 2 }, // slate, bone outline
} as const satisfies Record<TowerKind, { size: number; fill: number; outline: number; outlineWidth: number }>;

/** The range ring shown while the pointer is over a tower. */
export const RANGE_RING = { color: 0xffffff, alpha: 0.6, width: 1 } as const;

/** The ghost tower and range ring under the pointer: green where placement would succeed, red where it wouldn't. */
export const GHOST = {
  placeable: 0x6fcf4f,
  blocked: 0xe0533d,
  fillAlpha: 0.35,
  ringAlpha: 0.8,
  ringWidth: 1,
} as const;

/** The message that floats up from a refused click. */
export const FLOATING_TEXT = {
  durationMs: 900,
  risePx: 24,
  style: { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 },
} as const;

/** What a refused placement says. */
export const PLACEMENT_REFUSAL_TEXT = {
  gameEnded: 'The game has ended',
  notBuildable: "Can't build here",
  occupied: 'Tile occupied',
  insufficientMoney: 'Not enough money',
} as const satisfies Record<PlaceTowerRefusal, string>;

/** The line drawn for each hit, from the tower to the target. */
export const TRACER = { color: 0xffe9a0, width: 2, fadeMs: 80 } as const;

/** How long the HUD's "Wave N cleared" banner stays up, in sim ms. */
export const WAVE_BANNER_MS = 2000;

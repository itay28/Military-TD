import type { Layer } from '../sim/combat';
import type { PlaceTowerRefusal, UpgradeTowerRefusal } from '../sim/game';
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

/** Enemies as filled shapes, by kind (before the v0.4 sprites). Radius in pixels: a circle's radius, or half a square's side. */
export const ENEMY_STYLE = {
  infantry: { shape: 'circle', radius: 9, color: 0x9e3b2c }, // brick red
  jeep: { shape: 'square', radius: 7, color: 0x6b7d3a }, // olive drab
  helicopter: { shape: 'circle', radius: 11, color: 0x3f6f8f, rotor: 12 }, // steel blue, X rotor reaching 12 px along each axis
  tank: { shape: 'circle', radius: 14, color: 0x4a5d3a }, // dark olive drab
} as const satisfies Record<EnemyKind, { shape: 'circle' | 'square'; radius: number; color: number; rotor?: number }>;

/** The X drawn over a rotor kind. */
export const ROTOR = { color: 0xe5e1cf, width: 2 } as const;

/** The shadow under an air enemy, offset in pixels so it reads as flying. */
export const AIR_SHADOW = { offsetX: 4, offsetY: 10, color: 0x000000, alpha: 0.3 } as const;

/** The HP bar above each enemy. `gap` is the space between the bar and the top of the shape. */
export const HP_BAR = { width: 24, height: 4, gap: 4, back: 0x1a1a1a, backAlpha: 0.7, fill: 0x6fcf4f } as const;

/** How a tower kind is drawn (before the v0.4 sprites). */
export interface TowerStyle {
  readonly shape: 'square' | 'circle';
  /** Side or diameter in pixels, less than a tile so the grid shows around it. */
  readonly size: number;
  readonly fill: number;
  readonly outline: number;
  readonly outlineWidth: number;
}

/** Towers as outlined shapes, by kind. */
export const TOWER_STYLE = {
  rifleNest: { shape: 'square', size: 32, fill: 0x3b4252, outline: 0xe5e1cf, outlineWidth: 2 }, // slate, bone outline
  cannon: { shape: 'square', size: 36, fill: 0x6b4f2a, outline: 0xf0b429, outlineWidth: 3 }, // bronze, amber outline
  aaGun: { shape: 'circle', size: 30, fill: 0x8a5a2b, outline: 0xe5e1cf, outlineWidth: 2 }, // rust brown circle, bone outline
  mortar: { shape: 'circle', size: 34, fill: 0x4a3f2a, outline: 0xd9b45a, outlineWidth: 2 }, // dug-in brown pit, brass rim
} as const satisfies Record<TowerKind, TowerStyle>;

/** What the player calls each tower kind. Every kind needs one. */
export const TOWER_NAMES = {
  rifleNest: 'Rifle Nest',
  cannon: 'Cannon',
  aaGun: 'AA Gun',
  mortar: 'Mortar',
} as const satisfies Record<TowerKind, string>;

/** The build bar right of the canvas shows its tower buttons in this many columns. */
export const BUILD_BAR_COLUMNS = 2;

/** What each level above 1 is called: the equipment its upgrade adds. Same for every kind for now. */
export const LEVEL_NAME: Readonly<Record<number, string>> = { 2: 'Optics', 3: 'Heavier weapon' };

/** The small squares along a tower's bottom edge, one per upgrade. Pixels, from the tower square's corner. */
export const LEVEL_PIP = { size: 4, gap: 3, inset: 4, color: 0xe5e1cf } as const; // bone, like the outline

/** What the tower panel calls each layer a tower can hit. */
export const LAYER_NAME = { ground: 'Ground', air: 'Air' } as const satisfies Record<Layer, string>;

/** A dismantling tower is drawn at `alpha`, with a ring that shrinks from `radius` px to nothing as the time runs out. */
export const DISMANTLE = { alpha: 0.4, color: 0xe5e1cf, radius: 28, width: 2 } as const;

/** The range ring shown while the pointer is over a tower, or while it is selected, with an inner ring at its minimum range if it has one. */
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

/** Why the Upgrade button is disabled, as its tooltip. `maxLevel` never shows: the button is hidden then. */
export const UPGRADE_REFUSAL_TEXT = {
  gameEnded: 'The game has ended',
  noSuchTower: 'The tower is gone',
  dismantling: 'Being dismantled',
  maxLevel: 'Top level',
  insufficientMoney: 'Not enough money',
} as const satisfies Record<UpgradeTowerRefusal, string>;

/** The line drawn for each hit, from the tower to the target. */
export const TRACER = { fadeMs: 80 } as const;

/** Tracer line by tower kind: heavier for heavier guns. Width in pixels. */
export const TRACER_STYLE = {
  rifleNest: { color: 0xffe9a0, width: 2 },
  cannon: { color: 0xffb347, width: 4 },
  mortar: { color: 0xd9b45a, width: 3 }, // unused: the Mortar fires Shells, not tracers
  aaGun: { color: 0xffd27a, width: 1 },
} as const satisfies Record<TowerKind, { color: number; width: number }>;

/** A shell in flight (a dot) and its blast when it lands (a circle at the outer ring, fading over `blastFadeMs`). */
export const SHELL = { color: 0xd9d9d9, radius: 4, blastColor: 0xff8a3d, blastWidth: 2, blastFadeMs: 300 } as const;

/**
 * Pan and zoom of the map. `maxZoom` is how far in it zooms (it zooms out until the whole map fits); a press that
 * moves less than `dragThresholdPx` screen pixels is a click, not a drag; each wheel pixel zooms by `wheelZoomPerPx`
 * (as an exponent, so in and out are symmetric).
 */
export const CAMERA = { maxZoom: 2.5, dragThresholdPx: 8, wheelZoomPerPx: 0.0015 } as const;

/** How long the HUD's "Wave N cleared" banner stays up, in sim ms. */
export const WAVE_BANNER_MS = 2000;

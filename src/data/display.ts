import type { Layer } from '../sim/combat';
import type { Faction } from '../sim/factions';
import type { PlaceTowerRefusal, UpgradeTowerRefusal } from '../sim/game';
import type { EnemyKind } from './enemies';
import { GRID_COLS, GRID_ROWS } from './grid';
import { FONT_STACK } from './theme';
import { PALETTE } from './palette';
import type { TowerKind } from './towers';

/** Size of one tile in pixels. Only Scenes convert tiles to pixels. */
export const TILE_PX = 48;

export const CANVAS_WIDTH = GRID_COLS * TILE_PX;
export const CANVAS_HEIGHT = GRID_ROWS * TILE_PX;

/** Atlas sprites are drawn at this scale: a 64 px Kenney tile fills one map tile. */
export const SPRITE_SCALE = TILE_PX / 64;

/** How the map is drawn with shapes, when the atlas is missing, and the tint for the tileset's blocked ground. */
export const MAP_STYLE = {
  path: 0xc2a46b, // sand
  buildable: 0x5b6b3a, // olive
  blocked: 0x3a4526, // dark olive
  /** Tints the blocked ground sprite, so it reads darker than buildable grass even before its decoration. */
  blockedTint: 0xa8b0a0,
  grid: { color: 0x000000, alpha: 0.15, width: 1 },
} as const;

/** The tactical map grid (#400): grid squares of `cellTiles` × `cellTiles` tiles, thin low-alpha lines, and edge labels. Not `MAP_STYLE.grid`, the per-tile grid. */
export const MAP_GRID = {
  cellTiles: 4,
  line: { color: 0xffffff, alpha: 0.18, width: 1 },
  label: {
    style: { fontFamily: 'monospace', fontSize: '12px', color: '#f1ecd2', stroke: '#1d2410', strokeThickness: 3 },
    alpha: 0.85,
    /** Screen pixels between a label and the canvas edge. */
    insetPx: 3,
    /** A cell showing fewer screen pixels than this on an axis gets no label. */
    minVisiblePx: 16,
  },
} as const;

/** Enemies as filled shapes, by kind (before the v0.4 sprites). Radius in pixels: a circle's radius, or half a square's side. */
export const ENEMY_STYLE = {
  infantry: { shape: 'circle', radius: 9, color: 0x9e3b2c }, // brick red
  jeep: { shape: 'square', radius: 7, color: 0x6b7d3a }, // olive drab
  helicopter: { shape: 'circle', radius: 11, color: 0x3f6f8f, rotor: 12 }, // steel blue, X rotor reaching 12 px along each axis
  tank: { shape: 'circle', radius: 14, color: 0x4a5d3a }, // dark olive drab
  apc: { shape: 'square', radius: 11, color: 0x7a6a4f }, // khaki brown, a boxy hull
} as const satisfies Record<EnemyKind, { shape: 'circle' | 'square'; radius: number; color: number; rotor?: number }>;

/** The X drawn over a rotor kind. */
export const ROTOR = { color: 0xe5e1cf, width: 2 } as const;

/** The shadow under an air enemy, offset in pixels so it reads as flying. */
export const AIR_SHADOW = { offsetX: 4, offsetY: 10, color: 0x000000, alpha: 0.3 } as const;

/**
 * The enemies' movement animation, on real time (off with `?anim=0`): a `frames`-step cycle, one step every `frameMs`.
 * Each enemy starts `phaseMs` × its id into the cycle, so a group doesn't move in lockstep. A ground sprite's scale
 * follows `bob` (a step), the Helicopter's rotor turns a quarter turn over the cycle (an X repeats every 90°).
 */
const ENEMY_BOB = [1, 1.06, 1.03] as const;
/** `frames` is the length of `bob`, so the two cannot drift apart. */
export const ENEMY_ANIM = { frameMs: 120, frames: ENEMY_BOB.length, phaseMs: 130, bob: ENEMY_BOB } as const;

/**
 * The HP bar above each enemy. `gap` is the space between the bar and the top of the shape. Its length is the main
 * cue; at or below `lowAt` of max HP it also turns from `fill` to `low`.
 */
export const HP_BAR = {
  width: 24,
  height: 4,
  gap: 4,
  back: 0x1a1a1a,
  backAlpha: 0.7,
  fill: PALETTE.hpFull,
  low: PALETTE.hpLow,
  lowAt: 1 / 3,
} as const;

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

/**
 * What the player reads for the game's terms (ADR-0010): military, but clear first. Display text only; the code and
 * the sim keep `money`, `lives`, Victory and Defeat. Every screen, hint and tooltip takes its words from here.
 */
export const TERMS = {
  money: 'Funds',
  lives: 'HQ',
  startWave: 'Start wave',
  play: 'Deploy',
  levelSelect: 'Operations',
  victory: 'MISSION COMPLETE',
  defeat: 'MISSION FAILED',
  report: 'After-action report',
} as const;

/** An amount of Money as the player reads it: "$100". */
export const formatFunds = (amount: number): string => `$${amount}`;

/** The HUD banner when a wave starts. */
export const contactBanner = (waveNumber: number): string => `CONTACT — WAVE ${waveNumber}`;

/** What a locked map on the Operations screen says, naming the map that unlocks it. */
export const lockedLine = (previous: string | undefined): string => `Locked: complete ${previous ?? 'the map before'}`;

/** The HQ bar's state: `low` at or under `low` of the start Lives, `critical` at or under `critical`. */
export const HQ_BAR = { low: 0.5, critical: 0.25 } as const;

export type HqLevel = 'ok' | 'low' | 'critical';

/** How the HQ bar reads with `lives` of `maxLives` left. */
export function hqLevel(lives: number, maxLives: number): HqLevel {
  const share = maxLives > 0 ? lives / maxLives : 0;
  if (share <= HQ_BAR.critical) return 'critical';
  return share <= HQ_BAR.low ? 'low' : 'ok';
}

/** What the player calls each tower kind. Every kind needs one. */
export const TOWER_NAMES = {
  rifleNest: 'Rifle Nest',
  cannon: 'Cannon',
  aaGun: 'AA Gun',
  mortar: 'Mortar',
} as const satisfies Record<TowerKind, string>;

/** What each tower kind is for, in one line: the tower panel leads with it. Every kind needs one; keep it true to the stats. */
export const TOWER_ROLES = {
  rifleNest: 'Cheap all-rounder: hits ground and air. Light rounds that armor soaks.',
  aaGun: 'Built for aircraft: fast, light rounds. Hits ground too.',
  cannon: 'Slow, heavy shells that punch through armor. Ground only.',
  mortar: 'Long-range shells that hit everything in the blast. Ground only, not up close.',
} as const satisfies Record<TowerKind, string>;

/** What the player calls each enemy kind. Every kind needs one. */
export const ENEMY_NAMES = {
  infantry: 'Infantry',
  jeep: 'Jeep',
  helicopter: 'Helicopter',
  tank: 'Tank',
  apc: 'APC',
} as const satisfies Record<EnemyKind, string>;

/**
 * What hurts each enemy kind, in one plain line on its enemy card. Every kind needs one; keep it true to the stats
 * (armor, layer, and each tower's damage, pierce and targets).
 */
export const ENEMY_WEAKNESS = {
  infantry: 'No armor: every tower hurts it. Mortar blasts catch whole squads.',
  jeep: 'Fast but fragile, no armor: quick-firing Rifle Nests and AA Guns catch it.',
  helicopter: 'Flies: only Rifle Nests and AA Guns reach it. Its armor blunts rifle rounds; AA Guns work best.',
  tank: 'Armor: Rifle Nests barely scratch it. Cannons and Mortars work.',
  apc: 'Armored carrier. Kill it and its squad jumps out.',
} as const satisfies Record<EnemyKind, string>;

/** The smallest tap area of an enemy, as a diameter in screen pixels, so a small one is easy to hit on a phone. */
export const ENEMY_HIT_PX = 32;

/** The build bar right of the canvas shows its tower buttons in this many columns. */
export const BUILD_BAR_COLUMNS = 2;

/** What each level above 1 is called: the equipment its upgrade adds. Same for every kind for now. */
export const LEVEL_NAME: Readonly<Record<number, string>> = { 2: 'Optics', 3: 'Heavier weapon' };

/** The small squares along a tower's bottom edge, one per upgrade. Pixels, from the tower square's corner. */
/** The map cursor's tile outline (#356): a bright amber that stands out on grass, dirt and the Path. */
export const MAP_CURSOR = { color: 0xffc400, width: 3 } as const;

export const LEVEL_PIP = { size: 4, gap: 3, inset: 4, color: 0xe5e1cf } as const; // bone, like the outline

/** What the tower panel calls each layer a tower can hit. */
export const LAYER_NAME = { ground: 'Ground', air: 'Air' } as const satisfies Record<Layer, string>;

/** A dismantling tower is drawn at `alpha`, with a ring that shrinks from `radius` px to nothing as the time runs out. */
export const DISMANTLE = { alpha: 0.4, color: 0xe5e1cf, radius: 28, width: 2 } as const;

/** The range ring shown while the pointer is over a tower, or while it is selected, with an inner ring at its minimum range if it has one. */
export const RANGE_RING = { color: PALETTE.rangeRing, alpha: 0.6, width: 1 } as const;

/** The glow around every tower of the kind clicked in the DPS meter (#244): a bright outline that pulses, on both shapes. */
export const HIGHLIGHT = { color: 0x4fd1ff, width: 3, glowWidth: 8, glowAlpha: 0.35, pad: 5, pulseMs: 1200 } as const;

/**
 * The brackets at the corners of the selected tower's tile, `inset` px inside it with arms `arm` px long, over a dark
 * edge: the selection is a shape, not only the range ring the hovered tower has too.
 */
export const SELECTION = {
  color: PALETTE.selection,
  width: 2,
  inset: 2,
  arm: 10,
  outline: { color: 0x1b2412, alpha: 0.6, width: 4 },
} as const;

/**
 * The ghost tower and range ring under the pointer: green where placement would succeed, raspberry red with a cross
 * over the shape where it wouldn't. The cross reaches `reach` of the way from the centre to the shape's edge.
 */
export const GHOST = {
  placeable: PALETTE.valid,
  blocked: PALETTE.invalid,
  cross: { width: 3, reach: 0.7 },
  fillAlpha: 0.35,
  ringAlpha: 0.8,
  ringWidth: 1,
  /** A dark edge under the shape and range ring, so a green ghost still reads on grass (#43). */
  outline: { color: 0x1b2412, alpha: 0.6, width: 3 },
} as const;

/** The message that floats up from a refused click. */
export const FLOATING_TEXT = {
  durationMs: 900,
  risePx: 24,
  style: { fontFamily: FONT_STACK.mono, fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 },
} as const;

/** What a refused placement says. */
export const PLACEMENT_REFUSAL_TEXT = {
  gameEnded: 'The game has ended',
  notBuildable: "Can't build here",
  occupied: 'Tile occupied',
  insufficientMoney: 'Not enough funds',
} as const satisfies Record<PlaceTowerRefusal, string>;

/** Why the Upgrade button is disabled, as its tooltip. `maxLevel` never shows: the button is hidden then. */
export const UPGRADE_REFUSAL_TEXT = {
  gameEnded: 'The game has ended',
  noSuchTower: 'The tower is gone',
  dismantling: 'Being dismantled',
  maxLevel: 'Top level',
  insufficientMoney: 'Not enough funds',
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
export const CAMERA = { maxZoom: 2.5, dragThresholdPx: 8, wheelZoomPerPx: 0.0015, revealMarginPx: 40 } as const;

/**
 * With the reduced-motion setting on (#354): flashes, tracers and blasts carry information (ADR-0009), so they stay,
 * shorter. The text drift and walk cycle stop (`motionTimings`, src/scenes/motion.ts).
 */
export const REDUCED_MOTION = { effectLifeMs: 120, tracerFadeMs: 50, blastFadeMs: 150 } as const;

/** How long the HUD's "CONTACT — WAVE N" and "Wave N cleared" banners stay up, in sim ms. */
export const WAVE_BANNER_MS = 2000;

/**
 * Combat effects: all small and over within `lifeMs`, so they never hide enemies, health bars or range rings. Each is
 * a disc that fades out while growing by `growth` times its `radius` (in pixels).
 */
export const EFFECT = {
  lifeMs: 250,
  muzzleFlash: { color: 0xfff1b0, radius: 5, growth: 1 },
  explosion: { color: 0xff8a3d, radius: 8, growth: 1.6 },
  puff: { color: 0xc9c9c9, radius: 6, growth: 1.5 },
} as const;

/** The DPS meter rewrites its figures at most this often, in ms of real time (a few times a second). */
export const DPS_METER_REFRESH_MS = 250;

/** Below this width, in CSS pixels, the DPS meter starts with its kinds collapsed (the HUD's phone layout). */
export const DPS_METER_NARROW_PX = 640;

/** What the player calls each Faction (ADR-0009), as on the Field manual's faction switcher. */
export const FACTION_NAMES = {
  us: 'US',
  russia: 'Russia',
  china: 'China',
  insurgents: 'Insurgents',
} as const satisfies Record<Faction, string>;

/** Each Faction's mark on the Operations briefing (#401): a plain shape, never a flag or national emblem (ADR-0009). */
export const FACTION_INSIGNIA = {
  us: '▲',
  russia: '◆',
  china: '■',
  insurgents: '✕',
} as const satisfies Record<Faction, string>;

/** How the Operations screen's map cards draw their tactical overlay over the aerial image (#401). */
export const MAP_CARD = {
  grid: { color: '#f1ecd2', alpha: 0.35, width: 1 },
  route: { color: '#e0302a', alpha: 0.95, width: 2, dash: [6, 4] },
  entry: { color: '#e0302a', radius: 4 },
  exit: { color: '#f2c14e', size: 8 },
  label: { font: 'bold 10px monospace', color: '#f1ecd2', stroke: '#1d2410', insetPx: 4 },
} as const;

/**
 * The Field manual's model view: it spins `spinDegPerS` on its own (not with reduced motion); each arrow key or Rotate
 * button turns it `keyStepDeg`, and a drag `dragDegPerPx` per pixel across.
 */
export const FIELD_MANUAL = { spinDegPerS: 30, keyStepDeg: 15, dragDegPerPx: 0.5 } as const;

/** What a fight leaves on the ground (#403): a vehicle's wreck, an aircraft's crash mark, a shell crater, fallen infantry. */
export type DecalKind = 'wreck' | 'crashMark' | 'crater' | 'fallen';

/**
 * The battlefield's aftermath (#403), on real time. Wrecks and crash marks burn for `burnMs`, then fade over `fadeMs`;
 * craters only fade; fallen infantry tip over in `fallMs` and are gone by `fadeMs`. At most `cap` decals stay (the
 * performance budget, #73): the oldest fades out over `evictFadeMs` to make room. Reduced motion has no fire, no fall,
 * and fades `reducedFade` times as long.
 */
export const AFTERMATH = {
  cap: 40,
  burnMs: 3000,
  wreckFadeMs: 5000,
  craterFadeMs: 10000,
  fallenFadeMs: 3000,
  fallMs: 250,
  evictFadeMs: 300,
  reducedFade: 0.5,
  hull: { color: 0x2b2722, turret: 0x1c1a17, alpha: 0.9 }, // burnt-out steel
  scorch: { color: 0x14110e, alpha: 0.45 },
  crater: { color: 0x3a2f24, rim: 0x5a4a38, alpha: 0.6, size: 9 },
  fallen: { color: 0x3b3a2a, head: 0x5a4f40, alpha: 0.85 }, // a dark uniform, no blood
  fire: { colors: [0xff7a1a, 0xffc04d], radius: 3.5, flickerMs: 90 },
  smoke: { color: 0x6b6660, alpha: 0.45, riseMs: 1200, risePx: 18, puffs: 3 },
} as const;

/** The decal an enemy leaves when it dies, and its size in pixels. Every new kind (APC, jet, bosses) picks one. */
export const AFTERMATH_OF = {
  infantry: { decal: 'fallen', size: 8 },
  jeep: { decal: 'wreck', size: 8 },
  tank: { decal: 'wreck', size: 14 },
  apc: { decal: 'wreck', size: 12 },
  helicopter: { decal: 'crashMark', size: 12 },
} as const satisfies Record<EnemyKind, { decal: Exclude<DecalKind, 'crater'>; size: number }>;

import type { EnemyKind } from './enemies';
import type { TowerKind } from './towers';

/** The texture key the Boot scene loads the atlas (`assets/atlas/`, built by `npm run atlas`) under. */
export const ATLAS_KEY = 'sprites';

/** What a map tile is drawn as: Path, buildable, or blocked (neither: a tile the map marks non-buildable). */
export const TILE_TYPES = ['path', 'buildable', 'blocked'] as const;
export type TileType = (typeof TILE_TYPES)[number];

/** Every tower and enemy kind; map tiles have their own frames below. */
export type SpriteKind = TowerKind | EnemyKind;

/**
 * The atlas frame for each kind (docs/assets.md → Sprite per kind), or null to keep its shape. A tower's is its
 * turret, drawn over its base (`TOWER_BASES`); enemy facing is `SPRITE_HEADING`.
 */
export const SPRITES = {
  rifleNest: 'towerDefense_tile245',
  aaGun: 'towerDefense_tile203',
  cannon: 'towerDefense_tile249',
  mortar: 'towerDefense_tile226',
  infantry: 'towerDefense_tile247',
  jeep: 'towerDefense_tile269',
  tank: 'tankBody_sand',
  helicopter: null, // no pack has a rotorcraft
} as const satisfies Record<SpriteKind, string | null>;

/** The atlas frame `kind` is drawn with, or null when it has none. */
export function spriteFor(kind: SpriteKind): string | null {
  return SPRITES[kind];
}

/** Which two sides of a Path tile its road joins: a straight or one of the four bends. */
export type RoadShape = 'eastWest' | 'northSouth' | 'northEast' | 'northWest' | 'southEast' | 'southWest';

/** The road frame for each shape. Kenney names a bend by the corner it wraps around (UR joins north and east). */
export const ROAD_FRAMES = {
  eastWest: 'tileGrass_roadEast',
  northSouth: 'tileGrass_roadNorth',
  northEast: 'tileGrass_roadCornerUR',
  northWest: 'tileGrass_roadCornerUL',
  southEast: 'tileGrass_roadCornerLR',
  southWest: 'tileGrass_roadCornerLL',
} as const satisfies Record<RoadShape, string>;

/** The ground under tiles off the Path. */
export const GROUND_FRAMES = {
  buildable: 'tileGrass1',
  blocked: 'tileGrass2',
} as const satisfies Record<Exclude<TileType, 'path'>, string>;

/** What can stand on a blocked tile: trees, bushes (`td130`, `td131`) and rocks (`td135`–`td137`). */
export const DECORATION_FRAMES = [
  'treeGreen_small',
  'treeGreen_large',
  'towerDefense_tile130',
  'towerDefense_tile131',
  'towerDefense_tile135',
  'towerDefense_tile136',
  'towerDefense_tile137',
] as const;

/**
 * The way each enemy frame faces, in radians on the canvas (0 east, π/2 south), so the scene can turn it to its
 * heading. The Kenney Tower Defense units face east; the Tanks pack body faces north. A kind without a frame faces 0.
 */
export const SPRITE_HEADING = {
  infantry: 0,
  jeep: 0,
  tank: -Math.PI / 2,
  helicopter: 0,
} as const satisfies Record<EnemyKind, number>;

/** The frame each tower kind's turret stands on. */
export const TOWER_BASES = {
  rifleNest: 'sandbagBeige_open',
  aaGun: 'towerDefense_tile180',
  cannon: 'towerDefense_tile181',
  mortar: 'towerDefense_tile182',
} as const satisfies Record<TowerKind, string>;

/** Which way each turret frame points as drawn, in radians (0 east, −π/2 north): the soldier faces east, barrels north. */
export const TURRET_FACING = {
  rifleNest: 0,
  aaGun: -Math.PI / 2,
  cannon: -Math.PI / 2,
  mortar: -Math.PI / 2,
} as const satisfies Record<TowerKind, number>;

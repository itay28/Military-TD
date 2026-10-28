import type { EnemyKind } from './enemies';
import type { TowerKind } from './towers';

/** The texture key the Boot scene loads the atlas (`assets/atlas/`, built by `npm run atlas`) under. */
export const ATLAS_KEY = 'sprites';

/** What a map tile is drawn as. */
export const TILE_TYPES = ['path', 'buildable'] as const;
export type TileType = (typeof TILE_TYPES)[number];

/** Everything the Game scene can draw with a sprite. */
export type SpriteKind = TowerKind | EnemyKind | TileType;

/**
 * The atlas frame for each kind (docs/assets.md → Sprite per kind), or null to keep its shape. A tower's is its
 * turret, drawn over its base (`TOWER_BASES`); enemy facing is `SPRITE_HEADING`, road orientation with #43.
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
  buildable: 'tileGrass1',
  path: 'tileGrass_roadEast',
} as const satisfies Record<SpriteKind, string | null>;

/** The atlas frame `kind` is drawn with, or null when it has none. */
export function spriteFor(kind: SpriteKind): string | null {
  return SPRITES[kind];
}

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

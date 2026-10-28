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
 * The atlas frame for each kind (docs/assets.md → Sprite per kind), or null to keep its shape. One frame per kind
 * for now: tower bases come with #41, facing with #42, road orientation with #43.
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

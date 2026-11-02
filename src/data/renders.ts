import aaGunMeta from '../../assets/render-china-aa-gun/china-aa-gun.json';
import aaGunHullUrl from '../../assets/render-china-aa-gun/china-aa-gun-hull.png';
import aaGunTurretUrl from '../../assets/render-china-aa-gun/china-aa-gun-turret.png';
import tankMeta from '../../assets/render-russia-tank/russia-tank.json';
import tankHullUrl from '../../assets/render-russia-tank/russia-tank-hull.png';
import tankTurretUrl from '../../assets/render-russia-tank/russia-tank-turret.png';
import type { SpriteKind } from './sprites';

/**
 * A kind drawn from rendered sprites (ADR-0009, `scripts/render-sprite.py`): a hull with its shadow and a turret
 * over it that turns around `pivot`. Sizes are in canvas pixels at `pxPerTile`; the data comes from
 * `npm run render:pivot` (`assets/render-<id>/<id>.json`).
 */
export interface RenderedSprite {
  readonly id: string;
  readonly hullKey: string;
  readonly hullUrl: string;
  readonly turretKey: string;
  readonly turretUrl: string;
  readonly pxPerTile: number;
  readonly canvasPx: number;
  readonly pivot: { readonly x: number; readonly y: number };
}

function rendered(
  {
    id,
    pxPerTile,
    canvasPx,
    pivot,
  }: { id: string; pxPerTile: number; canvasPx: number; pivot: RenderedSprite['pivot'] },
  hullUrl: string,
  turretUrl: string,
): RenderedSprite {
  return {
    id,
    hullKey: `render-${id}-hull`,
    hullUrl,
    turretKey: `render-${id}-turret`,
    turretUrl,
    pxPerTile,
    canvasPx,
    pivot,
  };
}

/**
 * The kinds with a render; every other kind keeps its Kenney frame (`SPRITES`), as does one whose render didn't
 * load. Picking a faction's set per map is the faction data's job, not this table's.
 */
export const RENDERS: Partial<Record<SpriteKind, RenderedSprite>> = {
  aaGun: rendered(aaGunMeta, aaGunHullUrl, aaGunTurretUrl),
  tank: rendered(tankMeta, tankHullUrl, tankTurretUrl),
};

/** The render `kind` is drawn with, or null to keep Kenney. */
export function renderFor(kind: SpriteKind): RenderedSprite | null {
  return RENDERS[kind] ?? null;
}

/** Renders face north (`render-sprite.py` turns every model's front to +Y): −π/2 on the canvas. */
export const RENDER_FACING = -Math.PI / 2;

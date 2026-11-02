import { TILE_PX } from '../data/display';
import type { RenderedSprite } from '../data/renders';

/** How a render is laid over its entity: the hull centred on it, the turret's pivot over the hull's turret ring. */
export interface RenderPlacement {
  /** Canvas pixels to world pixels: `pxPerTile` becomes `TILE_PX`. */
  readonly scale: number;
  /** The turret image's origin (0–1 of its canvas), so it turns around its pivot. */
  readonly turretOrigin: { readonly x: number; readonly y: number };
  /** Where the turret goes from the entity centre, in world pixels, before the entity turns. */
  readonly turretOffset: { readonly x: number; readonly y: number };
}

/** Both layers share one camera framing, so the pivot's offset from the canvas centre is its offset on the hull. */
export function renderPlacement({
  pxPerTile,
  canvasPx,
  pivot,
}: Pick<RenderedSprite, 'pxPerTile' | 'canvasPx' | 'pivot'>): RenderPlacement {
  const scale = TILE_PX / pxPerTile;
  return {
    scale,
    turretOrigin: { x: pivot.x / canvasPx, y: pivot.y / canvasPx },
    turretOffset: { x: (pivot.x - canvasPx / 2) * scale, y: (pivot.y - canvasPx / 2) * scale },
  };
}

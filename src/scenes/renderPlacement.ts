import { TILE_PX } from '../data/display';
import { RENDER_FACING, type RenderedSprite } from '../data/renders';
import type { Pixel } from './coords';

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

/** How far ahead of the tower centre a Kenney kind's single flash starts, in world pixels. */
export const MUZZLE_FALLBACK_PX = TILE_PX * 0.4;

/**
 * Where each shot starts in world pixels for a tower centred on `at` with its turret aimed at `angle` (0 east, π/2
 * south): the render's barrel tips, turned with the turret around the pivot. A kind without a render has one tip
 * ahead of its centre.
 */
export function muzzlePoints(
  render: Pick<RenderedSprite, 'pxPerTile' | 'canvasPx' | 'pivot' | 'muzzles'> | null,
  at: Pixel,
  angle: number,
): Pixel[] {
  if (render === null) {
    return [{ x: at.x + Math.cos(angle) * MUZZLE_FALLBACK_PX, y: at.y + Math.sin(angle) * MUZZLE_FALLBACK_PX }];
  }
  const { scale, turretOffset } = renderPlacement(render);
  const turn = angle - RENDER_FACING;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return render.muzzles.map(({ x, y }) => {
    const dx = x * scale;
    const dy = y * scale;
    return { x: at.x + turretOffset.x + dx * cos - dy * sin, y: at.y + turretOffset.y + dx * sin + dy * cos };
  });
}

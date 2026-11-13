import { isTurretRender, type AnyRender } from '../data/renders';

/** What a DOM icon needs of a render (ADR-0009): its image URLs, bottom first, and the square canvas they share. */
export interface RenderIcon {
  readonly layerUrls: readonly string[];
  readonly canvasPx: number;
}

/** `render` as an icon: hull then turret (the turret already faces north), or its one image. */
export function renderIcon(render: AnyRender): RenderIcon {
  return {
    layerUrls: isTurretRender(render) ? [render.hullUrl, render.turretUrl] : [render.imageUrl],
    canvasPx: render.canvasPx,
  };
}

/** One stacked layer per image of `icon`, the canvas fitted to a `box`-pixel square. */
export function renderIconLayers(doc: Document, icon: RenderIcon, box: number): HTMLElement[] {
  return icon.layerUrls.map((url) => {
    const layer = doc.createElement('span');
    layer.className = 'build-icon-layer';
    layer.style.cssText =
      `position:absolute;left:50%;top:50%;width:${icon.canvasPx}px;height:${icon.canvasPx}px;background-repeat:no-repeat;` +
      `background-image:url("${url}");background-size:100% 100%;`;
    layer.style.transform = `translate(-50%,-50%) scale(${box / icon.canvasPx})`;
    return layer;
  });
}

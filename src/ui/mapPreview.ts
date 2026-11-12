import type { MapPainter } from '../scenes/drawMap';

/** A map tile's size on the Operations screen's map card, in CSS pixels. */
export const PREVIEW_TILE_PX = 12;

/** The part of a 2D canvas context the preview draws with, so tests can pass a recording fake. */
export type PreviewContext = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'globalAlpha' | 'lineWidth' | 'fillRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke'
>;

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** A MapPainter over a canvas, scaling the game's pixels by `scale`, so a card's drawn ground is `drawMap` itself. */
export function canvasPainter(ctx: PreviewContext, scale: number): MapPainter {
  return {
    fillStyle(color, alpha = 1) {
      ctx.fillStyle = css(color);
      ctx.globalAlpha = alpha;
    },
    fillRect(x, y, width, height) {
      ctx.fillRect(x * scale, y * scale, width * scale, height * scale);
    },
    lineStyle(lineWidth, color, alpha = 1) {
      ctx.lineWidth = lineWidth * scale;
      ctx.strokeStyle = css(color);
      ctx.globalAlpha = alpha;
    },
    lineBetween(x1, y1, x2, y2) {
      ctx.beginPath();
      ctx.moveTo(x1 * scale, y1 * scale);
      ctx.lineTo(x2 * scale, y2 * scale);
      ctx.stroke();
    },
  };
}

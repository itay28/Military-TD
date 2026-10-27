import { TILE_PX } from '../data/display';
import { drawMap, type MapPainter } from '../scenes/drawMap';
import type { GameMap } from '../sim/map';

/** A map tile's size on the Level select preview, in CSS pixels. */
export const PREVIEW_TILE_PX = 12;

/** The part of a 2D canvas context the preview draws with, so tests can pass a recording fake. */
export type PreviewContext = Pick<
  CanvasRenderingContext2D,
  'fillStyle' | 'strokeStyle' | 'globalAlpha' | 'lineWidth' | 'fillRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke'
>;

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** A MapPainter over a canvas, scaling the game's pixels by `scale`, so the preview is drawn by `drawMap` itself. */
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

/** Sizes `canvas` to the map at PREVIEW_TILE_PX a tile and draws its Path and buildable tiles. */
export function drawMapPreview(canvas: HTMLCanvasElement, map: GameMap): void {
  canvas.width = map.cols * PREVIEW_TILE_PX;
  canvas.height = map.rows * PREVIEW_TILE_PX;
  // happy-dom has no 2D context; the canvas keeps its size and stays blank there.
  const ctx = canvas.getContext('2d');
  if (ctx) drawMap(canvasPainter(ctx, PREVIEW_TILE_PX / TILE_PX), map);
}

import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../data/display';
import { MVP_MAP } from '../data/maps';
import { createMap } from '../sim/map';
import { canvasPainter, PREVIEW_TILE_PX, type PreviewContext } from './mapPreview';

/** A 2D context that records what is drawn, with the style it was drawn in. */
function recordingContext() {
  const calls: string[] = [];
  const ctx: PreviewContext = {
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    fillRect: (x, y, w, h) => calls.push(`fill ${ctx.fillStyle} ${ctx.globalAlpha} ${x},${y} ${w}x${h}`),
    beginPath: () => {},
    moveTo: (x, y) => calls.push(`from ${x},${y}`),
    lineTo: (x, y) => calls.push(`to ${x},${y}`),
    stroke: () => calls.push(`stroke ${ctx.strokeStyle} ${ctx.globalAlpha} ${ctx.lineWidth}`),
  };
  return { ctx, calls };
}

describe('canvasPainter', () => {
  it('fills with the colour as #rrggbb, scaled from game pixels to preview pixels', () => {
    const { ctx, calls } = recordingContext();
    canvasPainter(ctx, 0.25).fillStyle(0x5b6b3a);
    canvasPainter(ctx, 0.25).fillRect(48, 96, 48, 48);
    expect(calls).toEqual(['fill #5b6b3a 1 12,24 12x12']);
  });

  it('pads short colours with zeros and keeps the alpha', () => {
    const { ctx, calls } = recordingContext();
    const painter = canvasPainter(ctx, 0.5);
    painter.lineStyle(1, 0x000000, 0.15);
    painter.lineBetween(0, 0, 96, 0);
    expect(calls).toEqual(['from 0,0', 'to 48,0', 'stroke #000000 0.15 1']);
  });

  it('a new fill colour resets the alpha a line set', () => {
    const { ctx, calls } = recordingContext();
    const painter = canvasPainter(ctx, 1);
    painter.lineStyle(1, 0x000000, 0.15);
    painter.fillStyle(0xc2a46b);
    painter.fillRect(0, 0, 1, 1);
    expect(calls).toEqual(['fill #c2a46b 1 0,0 1x1']);
  });
});

describe('PREVIEW_TILE_PX', () => {
  it('draws a tile smaller than the game does', () => {
    expect(PREVIEW_TILE_PX).toBeLessThan(TILE_PX);
  });

  it('fits the MVP map in a small thumbnail', () => {
    const map = createMap(MVP_MAP);
    expect(map.cols * PREVIEW_TILE_PX).toBeLessThanOrEqual(240);
  });
});

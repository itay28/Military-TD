import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

/** Pixels at least this opaque are the figure; softer ones are its shadow and anti-aliasing. */
const OPAQUE = 128;

interface Model {
  readonly id: string;
  readonly kind: string;
}

const MODELS = (JSON.parse(readFileSync('scripts/render-sprite.json', 'utf8')) as { models: Model[] }).models;

/** The soldier renders of every faction: the walking Infantry, and the Rifle Nest's hull (pad, sandbags, shadow). */
const SOLDIER_SPRITES = MODELS.filter((m) => m.kind === 'infantry' || m.kind === 'rifleNest').map((m) => ({
  id: m.id,
  kind: m.kind,
  path: `assets/render-${m.id}/${m.kind === 'rifleNest' ? `${m.id}-hull` : m.id}.png`,
}));

interface Box {
  readonly w: number;
  readonly h: number;
}

/** The bounding box of the pixels whose alpha passes `test`, with the frame it sits in. */
function boundingBox(path: string, test: (alpha: number) => boolean): { box: Box; frame: Box } {
  const { width, height, data } = PNG.sync.read(readFileSync(path));
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!test(data[(y * width + x) * 4 + 3]!)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { box: { w: x1 - x0 + 1, h: y1 - y0 + 1 }, frame: { w: width, h: height } };
}

describe('soldier sprites (#342)', () => {
  it('covers all four factions, Infantry and Rifle Nest', () => {
    expect(SOLDIER_SPRITES).toHaveLength(8);
    for (const s of SOLDIER_SPRITES) expect(existsSync(s.path), s.path).toBe(true);
  });

  it('draws the figure big enough in its frame that it cannot shrink back to a speck', () => {
    for (const s of SOLDIER_SPRITES) {
      const { box, frame } = boundingBox(s.path, (a) => a >= OPAQUE);
      // The Infantry is a figure about half a tile long; the Rifle Nest hull's pad and sandbags fill most of its frame.
      const [minLongSide, minArea] = s.kind === 'infantry' ? [0.35, 0.07] : [0.5, 0.3];
      expect(Math.max(box.w, box.h) / Math.max(frame.w, frame.h), `${s.id} long side`).toBeGreaterThanOrEqual(
        minLongSide,
      );
      expect((box.w * box.h) / (frame.w * frame.h), `${s.id} area`).toBeGreaterThanOrEqual(minArea);
    }
  });

  it('has no baked haze: the visible pixels stay clear of the frame edge', () => {
    for (const s of SOLDIER_SPRITES) {
      const { box, frame } = boundingBox(s.path, (a) => a > 0);
      expect(box.w / frame.w, `${s.id} width`).toBeLessThan(0.95);
      expect(box.h / frame.h, `${s.id} height`).toBeLessThan(0.95);
    }
  });
});

describe('infantry reads at game tile size (#441)', () => {
  it('spans at least 0.6 tiles on its long side, for every faction', () => {
    const PX_PER_TILE = 128;
    for (const s of SOLDIER_SPRITES.filter((x) => x.kind === 'infantry')) {
      const { box } = boundingBox(s.path, (a) => a >= OPAQUE);
      expect(Math.max(box.w, box.h) / PX_PER_TILE, `${s.id} tiles`).toBeGreaterThanOrEqual(0.6);
    }
  });
});

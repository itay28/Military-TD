import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { RENDER_CONFIG, buildRenderMeta, renderMetaPath, turretPivot } from '../scripts/render-pivot';

/** A transparent `w` × `h` image with the given rectangles (x, y, w, h) opaque. */
function image(w: number, h: number, rects: [number, number, number, number][]): PNG {
  const png = new PNG({ width: w, height: h });
  for (const [rx, ry, rw, rh] of rects) {
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) png.data[(y * w + x) * 4 + 3] = 255;
  }
  return png;
}

describe('turretPivot', () => {
  it('is the centre of the turret body, ignoring a thin barrel', () => {
    // Body 20 × 20 at (10, 30); barrel 2 wide running north from it to the top edge.
    const png = image(40, 60, [
      [10, 30, 20, 20],
      [19, 0, 2, 30],
    ]);
    expect(turretPivot(png)).toEqual({ x: 20, y: 40 });
  });

  it('is the image centre for a body alone, centred', () => {
    expect(turretPivot(image(32, 32, [[8, 8, 16, 16]]))).toEqual({ x: 16, y: 16 });
  });

  it('ignores faint pixels (soft edges, the denoiser’s haze)', () => {
    const png = image(32, 32, [[8, 8, 16, 16]]);
    for (let x = 0; x < 32; x++) png.data[x * 4 + 3] = 40; // a faint top row as wide as the image
    expect(turretPivot(png)).toEqual({ x: 16, y: 16 });
  });

  it('refuses an empty turret', () => {
    expect(() => turretPivot(image(8, 8, []))).toThrow(/no opaque pixel/);
  });
});

describe('the committed render data', () => {
  it('has one entry per model in render-sprite.json', () => {
    expect(buildRenderMeta().map((m) => m.json.id)).toEqual(RENDER_CONFIG.models.map((m) => m.id));
  });

  for (const { path, json } of buildRenderMeta()) {
    it(`${path} is up to date (run npm run render:pivot)`, () => {
      expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(json);
    });
  }

  it('puts each pivot off the canvas centre, on the turret body (the reason it is data)', () => {
    for (const { json } of buildRenderMeta()) {
      const { pivot, canvasPx } = json;
      expect(pivot.y, json.id).toBeGreaterThan(canvasPx / 2 + 8); // behind the centre: the barrel reaches forward
      expect(Math.abs(pivot.x - canvasPx / 2), json.id).toBeLessThan(2); // on the centre line
    }
  });

  it('sizes the canvas from canvasTiles × pxPerTile', () => {
    for (const model of RENDER_CONFIG.models) {
      const { canvasPx, pxPerTile } = buildRenderMeta().find((m) => m.json.id === model.id)!.json;
      expect(pxPerTile).toBe(RENDER_CONFIG.pxPerTile);
      expect(canvasPx).toBe(Math.round(model.canvasTiles * RENDER_CONFIG.pxPerTile));
      expect(renderMetaPath(model.id)).toBe(`assets/render-${model.id}/${model.id}.json`);
    }
  });
});

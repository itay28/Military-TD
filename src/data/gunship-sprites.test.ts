import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../sim/factions';

/** Pixels at least this opaque are the airframe and rotor; softer ones are its shadow and anti-aliasing. */
const OPAQUE = 128;

interface Model {
  readonly id: string;
  readonly kind: string;
  readonly faction: string;
  readonly depicts: string;
  readonly lengthTiles: number;
  readonly canvasTiles: number;
  readonly turret?: unknown;
}

const LIST = JSON.parse(readFileSync('scripts/render-sprite.json', 'utf8')) as {
  pxPerTile: number;
  models: Model[];
};
const GUNSHIPS = LIST.models.filter((m) => m.kind === 'gunship');
const helicopterOf = (faction: string) => LIST.models.find((m) => m.kind === 'helicopter' && m.faction === faction)!;
const png = (m: Model) => `assets/render-${m.id}/${m.id}.png`;

/** The width and height of the pixels whose alpha passes `test`, with the frame they sit in. */
function boundingBox(path: string, test: (alpha: number) => boolean) {
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
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, frameW: width, frameH: height };
}

describe('Gunship renders (#363)', () => {
  it('has one gunship model per faction, each with its render, meta and license', () => {
    expect(GUNSHIPS.map((m) => m.faction).sort()).toEqual([...FACTIONS].sort());
    for (const m of GUNSHIPS) {
      expect(m.id).toBe(`${m.faction}-gunship`);
      expect(m.depicts, m.id).not.toBe('');
      for (const file of [png(m), `assets/render-${m.id}/${m.id}.json`, `assets/render-${m.id}/License.txt`])
        expect(existsSync(file), file).toBe(true);
    }
  });

  it('is about 1.4 tiles long, bigger than the Helicopter (ADR-0009 point 2)', () => {
    for (const m of GUNSHIPS) {
      expect(m.lengthTiles, m.id).toBeCloseTo(1.4, 1);
      expect(m.lengthTiles, m.id).toBeGreaterThan(helicopterOf(m.faction).lengthTiles);
    }
  });

  it('reads bigger on screen than the same faction’s Helicopter', () => {
    for (const m of GUNSHIPS) {
      const gunship = boundingBox(png(m), (a) => a >= OPAQUE);
      const heli = boundingBox(png(helicopterOf(m.faction)), (a) => a >= OPAQUE);
      expect(Math.max(gunship.w, gunship.h), m.id).toBeGreaterThan(Math.max(heli.w, heli.h));
    }
  });

  it('is rendered at the shared scale on its canvas, with its meta to match', () => {
    for (const m of GUNSHIPS) {
      const meta = JSON.parse(readFileSync(`assets/render-${m.id}/${m.id}.json`, 'utf8')) as {
        kind: string;
        pxPerTile: number;
        canvasPx: number;
      };
      const box = boundingBox(png(m), (a) => a > 0);
      expect(meta).toMatchObject({ kind: 'gunship', pxPerTile: LIST.pxPerTile });
      expect(meta.canvasPx, m.id).toBe(Math.round(m.canvasTiles * LIST.pxPerTile));
      expect([box.frameW, box.frameH], m.id).toEqual([meta.canvasPx, meta.canvasPx]);
    }
  });

  it('has no baked haze: the visible pixels stay clear of the frame edge', () => {
    for (const m of GUNSHIPS) {
      const box = boundingBox(png(m), (a) => a > 0);
      expect(box.w / box.frameW, `${m.id} width`).toBeLessThan(0.98);
      expect(box.h / box.frameH, `${m.id} height`).toBeLessThan(0.98);
    }
  });

  it('turns as one piece, like the Helicopter: no turret layer', () => {
    for (const m of GUNSHIPS) {
      expect(m.turret, m.id).toBeUndefined();
      expect(existsSync(`assets/render-${m.id}/${m.id}-turret.png`), m.id).toBe(false);
    }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

interface Model {
  readonly id: string;
  readonly kind: string;
  readonly faction: string;
  readonly lengthTiles: number;
  readonly liftTiles?: number;
}

const CONFIG = JSON.parse(readFileSync('scripts/render-sprite.json', 'utf8')) as {
  pxPerTile: number;
  models: Model[];
};
const PX = CONFIG.pxPerTile;
/** Rendered so far (#482); China and Insurgents come in the next part and are exempt until then. */
const DONE = ['us', 'russia'];
const PENDING = ['china', 'insurgents'];
const jets = CONFIG.models.filter((m) => m.kind === 'jet');
const helicopters = CONFIG.models.filter((m) => m.kind === 'helicopter');
const pathOf = (m: Model): string => `assets/render-${m.id}/${m.id}.png`;

/** Centroids, in tiles, of the airframe (opaque) and of its ground shadow (dark, half transparent). */
function centroids(path: string): { body: { x: number; y: number }; shadow: { x: number; y: number }; long: number } {
  const { width, height, data } = PNG.sync.read(readFileSync(path));
  const body = { x: 0, y: 0, n: 0 };
  const shadow = { x: 0, y: 0, n: 0 };
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]!;
      if (a >= 250) {
        body.x += x;
        body.y += y;
        body.n++;
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      } else if (a >= 40 && a < 200) {
        shadow.x += x;
        shadow.y += y;
        shadow.n++;
      }
    }
  }
  const tiles = (c: { x: number; y: number; n: number }) => ({ x: c.x / c.n / PX, y: c.y / c.n / PX });
  return { body: tiles(body), shadow: tiles(shadow), long: Math.max(x1 - x0 + 1, y1 - y0 + 1) / PX };
}

/** How far the shadow sits from the airframe, in tiles, toward the south-east (away from the top-left sun). */
function shadowOffset(path: string): number {
  const { body, shadow } = centroids(path);
  return (shadow.x - body.x + (shadow.y - body.y)) / Math.SQRT2;
}

describe('Fighter jet renders (#482)', () => {
  it('has a jet for US and Russia; China and Insurgents are pending (next part)', () => {
    expect(jets.map((m) => m.faction).sort()).toEqual([...DONE].sort());
    for (const f of PENDING)
      expect(
        jets.find((m) => m.faction === f),
        f,
      ).toBeUndefined();
    for (const m of jets) expect(existsSync(pathOf(m)), pathOf(m)).toBe(true);
  });

  it('is enlarged for readability: about 1.3 tiles long (ADR-0009 point 2)', () => {
    for (const m of jets) {
      expect(m.lengthTiles, m.id).toBeCloseTo(1.3, 1);
      expect(centroids(pathOf(m)).long, m.id).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('flies higher than the helicopter, so its shadow falls further off', () => {
    const heli = Math.max(...helicopters.map((m) => m.liftTiles ?? 0));
    const heliOffset = Math.max(...helicopters.map((m) => shadowOffset(pathOf(m))));
    for (const m of jets) {
      expect(m.liftTiles ?? 0, m.id).toBeGreaterThan(heli);
      expect(shadowOffset(pathOf(m)), m.id).toBeGreaterThan(heliOffset + 0.1);
    }
  });
});

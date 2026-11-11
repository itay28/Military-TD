import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import type { Faction } from '../sim/factions';
import { modelFor } from './modelViews';

/** Pixels at least this opaque are the vehicle; softer ones are its shadow and anti-aliasing. */
const OPAQUE = 128;

interface Model {
  readonly id: string;
  readonly kind: string;
  readonly faction: string;
  readonly lengthTiles: number;
}

const CONFIG = JSON.parse(readFileSync('scripts/render-sprite.json', 'utf8')) as {
  pxPerTile: number;
  models: Model[];
};

const modelOf = (faction: string, kind: string): Model | undefined =>
  CONFIG.models.find((m) => m.faction === faction && m.kind === kind);

/** The long side, in pixels, of the box around the pixels at least OPAQUE. */
function longSide(path: string): number {
  const { width, height, data } = PNG.sync.read(readFileSync(path));
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < OPAQUE) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? 0 : Math.max(x1 - x0 + 1, y1 - y0 + 1);
}

/** The Factions rendered so far: China and Insurgents come with the next part (#509). */
const RENDERED: readonly Faction[] = ['us', 'russia'];

const file = (id: string, suffix = '') => `assets/render-${id}/${id}${suffix}.png`;

describe('Heavy tank boss renders (#362, #508)', () => {
  for (const faction of RENDERED) {
    describe(faction, () => {
      const heavy = modelOf(faction, 'heavyTank');

      it('has a model, rendered as a whole, a hull and a turret layer', () => {
        expect(heavy, `${faction} heavyTank in render-sprite.json`).toBeDefined();
        for (const suffix of ['', '-hull', '-turret']) expect(existsSync(file(heavy!.id, suffix)), suffix).toBe(true);
      });

      it('is set bigger than the Tank, about 1.4 tiles, so it reads as a boss', () => {
        const tank = modelOf(faction, 'tank')!;
        expect(heavy!.lengthTiles).toBeGreaterThan(tank.lengthTiles);
        expect(heavy!.lengthTiles).toBeGreaterThanOrEqual(1.35);
        expect(heavy!.lengthTiles).toBeLessThanOrEqual(1.5);
      });

      it('draws a longer hull than the Tank’s on screen', () => {
        const tank = modelOf(faction, 'tank')!;
        const hull = longSide(file(heavy!.id, '-hull'));
        expect(hull).toBeGreaterThan(longSide(file(tank.id, '-hull')));
        // The hull alone (no barrel) is most of the set length, never more than it plus its shadow.
        expect(hull / CONFIG.pxPerTile).toBeGreaterThan(0.9);
        expect(hull / CONFIG.pxPerTile).toBeLessThan(1.6);
      });

      it('has a turret layer of its own, smaller than the hull', () => {
        const turret = longSide(file(heavy!.id, '-turret'));
        expect(turret).toBeGreaterThan(0);
        expect(turret).toBeLessThan(longSide(file(heavy!.id, '-hull')) * 1.2); // the barrel may overhang the nose
      });

      it('shows in the Field manual as its whole render, like the Tank', () => {
        expect(modelFor(faction, 'heavyTank').layers).toHaveLength(1);
        expect(modelFor(faction, 'heavyTank').layers[0]).toContain(`${heavy!.id}.png`);
      });
    });
  }
});

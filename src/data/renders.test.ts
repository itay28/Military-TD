import { describe, expect, it } from 'vitest';
import { RENDERS, RENDER_FACING, renderFor } from './renders';
import { SPRITES, type SpriteKind } from './sprites';

describe('RENDERS', () => {
  it('has the spike’s two renders: the China AA Gun and the Russia Tank', () => {
    expect(Object.keys(RENDERS).sort()).toEqual(['aaGun', 'tank']);
    expect(RENDERS.aaGun!.id).toBe('china-aa-gun');
    expect(RENDERS.tank!.id).toBe('russia-tank');
  });

  it('gives each a hull and a turret texture, both its own keys', () => {
    for (const render of Object.values(RENDERS)) {
      expect(render.hullKey).toBe(`render-${render.id}-hull`);
      expect(render.turretKey).toBe(`render-${render.id}-turret`);
      expect(render.hullUrl).toMatch(/hull\.png/);
      expect(render.turretUrl).toMatch(/turret\.png/);
    }
  });

  it('reads the pivot from the render data: a tank off the canvas centre, a tower on its pad the centre', () => {
    expect(RENDERS.tank!.canvasPx).toBe(192);
    expect(RENDERS.tank!.pivot.y).toBeGreaterThan(96);
    // The AA Gun stands on its sandbagged pad (#316), so it turns about the pad centre.
    expect(RENDERS.aaGun!.canvasPx).toBe(160);
    expect(RENDERS.aaGun!.pivot).toEqual({ x: 80, y: 80 });
  });

  it('keeps Kenney for every kind without a render', () => {
    for (const kind of Object.keys(SPRITES) as SpriteKind[]) {
      if (kind in RENDERS) continue;
      expect(renderFor(kind), kind).toBeNull();
    }
    expect(SPRITES.aaGun).not.toBeNull(); // the fallback when the render doesn't load
    expect(SPRITES.tank).not.toBeNull();
  });

  it('renders face north', () => {
    expect(RENDER_FACING).toBeCloseTo(-Math.PI / 2);
  });
});

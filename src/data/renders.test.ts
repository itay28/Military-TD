import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
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

  it('has a barrel tip per barrel: two on the AA Gun, one on the tank, all ahead of the pivot', () => {
    expect(RENDERS.aaGun!.muzzles).toHaveLength(2);
    expect(RENDERS.tank!.muzzles).toHaveLength(1);
    for (const render of Object.values(RENDERS)) for (const m of render.muzzles) expect(m.y).toBeLessThan(-40);
  });

  it('gives every render at least one barrel tip, so no rendered tower fires from nowhere', () => {
    for (const render of Object.values(RENDERS)) expect(render.muzzles.length).toBeGreaterThan(0);
  });

  it('keeps Kenney for every kind without a render', () => {
    for (const kind of Object.keys(SPRITES) as SpriteKind[]) {
      if (kind in RENDERS) continue;
      expect(renderFor(kind), kind).toBeNull();
    }
    expect(SPRITES.aaGun).not.toBeNull(); // the fallback when the render doesn't load
    expect(SPRITES.tank).not.toBeNull();
  });

  it('has no hull/turret render for the Fighter jet: it is one top-down sprite (#482, src/data/jet-sprites.test.ts)', () => {
    expect('jet' in RENDERS).toBe(false);
  });

  it('leaves the APC out until it is in play (#76): its US render (#478) is only in the Field manual for now', () => {
    expect('apc' in RENDERS).toBe(false);
    expect(SPRITES.apc).toBeNull();
  });

  it('renders face north', () => {
    expect(RENDER_FACING).toBeCloseTo(-Math.PI / 2);
  });
});

describe('the committed Grenade launcher renders (art-ahead: not in RENDERS until #359 puts it in play)', () => {
  // The Factions whose Grenade launcher is rendered so far: US (#464), Russia (#467). Later parts of #359 add theirs.
  for (const faction of ['us', 'russia']) {
    const id = `${faction}-grenade-launcher`;
    const dir = `assets/render-${id}`;

    it(`${id} has its pivot data: a 1.25-tile canvas turning about the pad centre`, () => {
      const meta = JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'));
      expect(meta).toMatchObject({
        id,
        kind: 'grenadeLauncher',
        pxPerTile: 128,
        canvasPx: 160,
        pivot: { x: 80, y: 80 },
      });
    });

    for (const layer of ['hull', 'turret'] as const) {
      it(`${id} has a ${layer} layer on the same canvas`, () => {
        const path = `${dir}/${id}-${layer}.png`;
        expect(existsSync(path), path).toBe(true);
        const png = PNG.sync.read(readFileSync(path));
        expect([png.width, png.height]).toEqual([160, 160]);
      });
    }

    it(`keeps ${id} out of RENDERS until it is in play`, () => {
      expect(Object.values(RENDERS).map((r) => r.id)).not.toContain(id);
    });
  }
});

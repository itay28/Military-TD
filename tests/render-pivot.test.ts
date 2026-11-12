import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { NOT_PLAYABLE_KINDS } from '../src/data/enemies';
import { isUpcoming, UPCOMING_KINDS } from '../src/data/modelViews';
import { SPRITES } from '../src/data/sprites';
import { NOT_IN_PLAY, type TowerKind } from '../src/data/towers';
import { FACTIONS } from '../src/sim/factions';
import { RENDER_CONFIG, buildRenderMeta, renderMeta, renderMetaPath, turretPivot } from '../scripts/render-pivot';

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

describe('renderMeta', () => {
  it('measures the pivot of a model with a turret', () => {
    const read = () => image(32, 32, [[8, 8, 16, 16]]);
    const meta = renderMeta({ id: 'x', kind: 'tank', canvasTiles: 0.25, turret: { names: ['t'] } }, 128, read);
    expect(meta).toEqual({ id: 'x', kind: 'tank', pxPerTile: 128, canvasPx: 32, pivot: { x: 16, y: 16 } });
  });

  it('gives a model without a turret (Infantry, Jeep, Helicopter) no pivot, and reads no turret PNG', () => {
    const read = () => {
      throw new Error('read a turret PNG');
    };
    const meta = renderMeta({ id: 'y', kind: 'jeep', canvasTiles: 1 }, 128, read);
    expect(meta).toEqual({ id: 'y', kind: 'jeep', pxPerTile: 128, canvasPx: 128 });
  });

  it('turns a tower on a base (its sandbagged pit) about the pit centre, the canvas centre', () => {
    const read = () => image(160, 160, [[10, 10, 20, 20]]); // a turret far off-centre: not measured
    const meta = renderMeta(
      { id: 'z', kind: 'mortar', canvasTiles: 1.25, turret: { allBut: [] }, base: { radiusTiles: 0.4 } },
      128,
      read,
    );
    expect(meta.pivot).toEqual({ x: 80, y: 80 });
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

  it('puts each measured pivot off the canvas centre, on the turret body (the reason it is data)', () => {
    const measured = RENDER_CONFIG.models.filter((m) => m.turret !== undefined && m.base === undefined);
    expect(measured.length).toBeGreaterThan(0);
    for (const { json } of buildRenderMeta().filter((m) => measured.some((x) => x.id === m.json.id))) {
      const { canvasPx } = json;
      const pivot = json.pivot!;
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

/**
 * v0.8.0 kinds whose renders come before the kind is in play (#360). They aren't a `SpriteKind` until their gameplay
 * issue lands (the APC: #76). A Faction has one when `render-sprite.json` lists a model of it; the rest are exempt.
 */
const OPTIONAL_KINDS: readonly string[] = ['apc', 'jet', 'sniper'];

describe('the complete Faction sets (ADR-0009, point 5)', () => {
  // A kind not in play yet (the Sniper, renders in #358) has none until its rollout;
  // the Heavy tank (in UPCOMING_KINDS) joins once all four Factions have it (#509).
  const inPlay = Object.keys(SPRITES).filter(
    (kind) => !NOT_IN_PLAY.has(kind as TowerKind) && !(NOT_PLAYABLE_KINDS as readonly string[]).includes(kind),
  );
  for (const faction of FACTIONS) {
    it(`has one render per kind for ${faction}`, () => {
      const models = RENDER_CONFIG.models.filter((m) => m.faction === faction);
      const kinds = [...inPlay, ...OPTIONAL_KINDS.filter((k) => models.some((m) => m.kind === k))].sort();
      expect(
        models
          .filter((m) => !isUpcoming(m.kind))
          .map((m) => m.kind)
          .sort(),
      ).toEqual(kinds);
      expect(new Set(models.map((m) => m.kind)).size).toBe(models.length);
    });
  }

  it('lists a kind as upcoming only until it is in play (then drop it from UPCOMING_KINDS)', () => {
    // A kind may be a sim kind (the Heavy tank boss, #457) with a null sprite, but has no frame until it is in play.
    for (const kind of UPCOMING_KINDS)
      expect((SPRITES as Record<string, string | null>)[kind] ?? null, kind).toBeNull();
  });

  it('keeps the new kinds out of SPRITES until they are in play', () => {
    // The jet is already a sprite kind, kept out of play by NOT_PLAYABLE_KINDS; the Sniper by NOT_IN_PLAY.
    for (const kind of OPTIONAL_KINDS)
      expect(
        kind in SPRITES &&
          !(NOT_PLAYABLE_KINDS as readonly string[]).includes(kind) &&
          !NOT_IN_PLAY.has(kind as TowerKind),
        kind,
      ).toBe(false);
  });
});

describe('the US APC render (#478)', () => {
  const model = RENDER_CONFIG.models.find((m) => m.id === 'us-apc')!;
  const png = PNG.sync.read(readFileSync('assets/render-us-apc/us-apc.png'));

  it('is the APC kind for the US, a single image with no turret', () => {
    expect(model).toMatchObject({ kind: 'apc', faction: 'us' });
    expect(model.turret).toBeUndefined();
    expect(buildRenderMeta().find((m) => m.json.id === 'us-apc')!.json.pivot).toBeUndefined();
  });

  it('fills its canvas: canvasTiles × pxPerTile, with the shadow inside the edges', () => {
    expect(png.width).toBe(Math.round(model.canvasTiles * RENDER_CONFIG.pxPerTile));
    expect(png.height).toBe(png.width);
    const alpha = (x: number, y: number): number => png.data[(y * png.width + x) * 4 + 3]!;
    for (let i = 0; i < png.width; i++) {
      expect(alpha(i, 0)).toBe(0);
      expect(alpha(i, png.height - 1)).toBe(0);
      expect(alpha(0, i)).toBe(0);
      expect(alpha(png.width - 1, i)).toBe(0);
    }
  });

  it('is about 0.9 tile long (ADR-0009, point 2), facing north: longer than wide', () => {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -1, -1];
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3]! < 250) continue; // the vehicle, not its softer shadow
        [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
      }
    const length = (maxY - minY + 1) / RENDER_CONFIG.pxPerTile;
    expect(length).toBeGreaterThan(0.82);
    expect(length).toBeLessThan(0.98);
    expect(maxX - minX + 1).toBeLessThan(maxY - minY + 1);
  });
});

describe('the Russia APC render (#480)', () => {
  const model = RENDER_CONFIG.models.find((m) => m.id === 'russia-apc')!;
  const png = PNG.sync.read(readFileSync('assets/render-russia-apc/russia-apc.png'));

  it('is the APC kind for Russia, a single image with no turret', () => {
    expect(model).toMatchObject({ kind: 'apc', faction: 'russia' });
    expect(model.turret).toBeUndefined();
    expect(buildRenderMeta().find((m) => m.json.id === 'russia-apc')!.json.pivot).toBeUndefined();
  });

  it('fills its canvas: canvasTiles × pxPerTile, with the shadow inside the edges', () => {
    expect(png.width).toBe(Math.round(model.canvasTiles * RENDER_CONFIG.pxPerTile));
    expect(png.height).toBe(png.width);
    const alpha = (x: number, y: number): number => png.data[(y * png.width + x) * 4 + 3]!;
    for (let i = 0; i < png.width; i++) {
      expect(alpha(i, 0)).toBe(0);
      expect(alpha(i, png.height - 1)).toBe(0);
      expect(alpha(0, i)).toBe(0);
      expect(alpha(png.width - 1, i)).toBe(0);
    }
  });

  it('is about 0.9 tile long (ADR-0009, point 2), facing north: longer than wide', () => {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -1, -1];
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3]! < 250) continue; // the vehicle, not its softer shadow
        [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
      }
    const length = (maxY - minY + 1) / RENDER_CONFIG.pxPerTile;
    expect(length).toBeGreaterThan(0.82);
    expect(length).toBeLessThan(0.98);
    expect(maxX - minX + 1).toBeLessThan(maxY - minY + 1);
  });

  it('has a turntable for the Field manual (#408), a WebP sheet with its JSON', () => {
    const meta = JSON.parse(readFileSync('assets/render-russia-apc/russia-apc-turntable.json', 'utf8'));
    expect(meta).toMatchObject({ id: 'russia-apc', kind: 'apc', faction: 'russia' });
    const sheet = readFileSync('assets/render-russia-apc/russia-apc-turntable.webp');
    expect(sheet.toString('ascii', 8, 12)).toBe('WEBP');
    expect(sheet.length).toBeLessThan(300_000);
  });
});

describe('the China APC render (#481)', () => {
  const model = RENDER_CONFIG.models.find((m) => m.id === 'china-apc')!;
  const png = PNG.sync.read(readFileSync('assets/render-china-apc/china-apc.png'));

  it('is the APC kind for China, a single image with no turret', () => {
    expect(model).toMatchObject({ kind: 'apc', faction: 'china' });
    expect(model.turret).toBeUndefined();
    expect(buildRenderMeta().find((m) => m.json.id === 'china-apc')!.json.pivot).toBeUndefined();
  });

  it('fills its canvas: canvasTiles × pxPerTile, with the shadow inside the edges', () => {
    expect(png.width).toBe(Math.round(model.canvasTiles * RENDER_CONFIG.pxPerTile));
    expect(png.height).toBe(png.width);
    const alpha = (x: number, y: number): number => png.data[(y * png.width + x) * 4 + 3]!;
    for (let i = 0; i < png.width; i++) {
      expect(alpha(i, 0)).toBe(0);
      expect(alpha(i, png.height - 1)).toBe(0);
      expect(alpha(0, i)).toBe(0);
      expect(alpha(png.width - 1, i)).toBe(0);
    }
  });

  it('is about 0.9 tile long (ADR-0009, point 2), facing north: longer than wide', () => {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -1, -1];
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3]! < 250) continue; // the vehicle, not its softer shadow
        [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
      }
    const length = (maxY - minY + 1) / RENDER_CONFIG.pxPerTile;
    expect(length).toBeGreaterThan(0.82);
    expect(length).toBeLessThan(0.98);
    expect(maxX - minX + 1).toBeLessThan(maxY - minY + 1);
  });

  it('has a turntable for the Field manual (#408), a WebP sheet with its JSON', () => {
    const meta = JSON.parse(readFileSync('assets/render-china-apc/china-apc-turntable.json', 'utf8'));
    expect(meta).toMatchObject({ id: 'china-apc', kind: 'apc', faction: 'china' });
    const sheet = readFileSync('assets/render-china-apc/china-apc-turntable.webp');
    expect(sheet.toString('ascii', 8, 12)).toBe('WEBP');
    expect(sheet.length).toBeLessThan(300_000);
  });
});

describe('the Sniper renders (art-ahead, #358)', () => {
  const snipers = RENDER_CONFIG.models.filter((m) => m.kind === 'sniper');

  it('covers every Faction: US (#459), Russia and China (#460), Insurgents (#462)', () => {
    expect(snipers.map((m) => m.faction).sort()).toEqual([...FACTIONS].sort());
  });

  for (const model of snipers) {
    it(`${model.id} is a team on a dug-in base that turns about the pad centre`, () => {
      expect(model.base, 'a base').toBeDefined();
      expect(model.turret, 'a turret layer').toBeDefined();
      const { json } = buildRenderMeta().find((m) => m.json.id === model.id)!;
      expect(json.pivot).toEqual({ x: json.canvasPx / 2, y: json.canvasPx / 2 });
    });
  }
});

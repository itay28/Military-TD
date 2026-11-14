import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  ALL_RENDERS,
  RENDER_FACING,
  drawnRender,
  factionFor,
  isTurretRender,
  renderFor,
  renderKeys,
  renderTextures,
  type AnyRender,
} from './renders';
import { FACTIONS, type Faction } from '../sim/factions';
import { SPRITES, type SpriteKind } from './sprites';
import { TURNTABLE_BUDGET_BYTES } from './turntables';
import { BUILD_KINDS, NOT_IN_PLAY, type TowerKind } from './towers';
import { NOT_PLAYABLE_KINDS, PLAYABLE_KINDS } from './enemies';
import { MAPS } from './maps';

const IN_PLAY: readonly SpriteKind[] = [...BUILD_KINDS, ...PLAYABLE_KINDS];
const SINGLE_IMAGE: readonly SpriteKind[] = ['infantry', 'jeep', 'helicopter', 'apc', 'jet'];
const kebab = (kind: string) => kind.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const render = (kind: SpriteKind, faction: Faction): AnyRender => {
  const found = renderFor(kind, faction);
  if (found === null) throw new Error(`no render for ${faction} ${kind}`);
  return found;
};
const turretRenders = () => ALL_RENDERS.filter(isTurretRender);

describe('the render table (#566)', () => {
  it('covers the 12 in-play kinds', () => {
    expect([...IN_PLAY].sort()).toEqual(
      [
        'aaGun',
        'apc',
        'cannon',
        'grenadeLauncher',
        'heavyTank',
        'helicopter',
        'infantry',
        'jeep',
        'jet',
        'mortar',
        'rifleNest',
        'tank',
      ].sort(),
    );
  });

  for (const kind of IN_PLAY)
    for (const faction of FACTIONS)
      it(`has the ${faction} ${kind}, under its render id`, () => {
        const r = render(kind, faction);
        expect(r.id).toBe(`${faction}-${kebab(kind)}`);
        expect(r).toMatchObject({ kind, faction, pxPerTile: 128 });
      });

  it('picks the faction’s own model: the US AA Gun is us-aa-gun', () => {
    expect(render('aaGun', 'us').id).toBe('us-aa-gun');
  });

  it('holds exactly in-play kinds × factions, so no art-ahead kind slips into play', () => {
    expect(ALL_RENDERS).toHaveLength(IN_PLAY.length * FACTIONS.length);
    for (const kind of [...NOT_IN_PLAY, ...NOT_PLAYABLE_KINDS] as SpriteKind[])
      for (const faction of FACTIONS) expect(renderFor(kind, faction), `${faction} ${kind}`).toBeNull();
  });

  it('gives Infantry, Jeep, Helicopter, APC and Jet one image and no turret', () => {
    for (const kind of SINGLE_IMAGE)
      for (const faction of FACTIONS) {
        const r = render(kind, faction);
        expect(isTurretRender(r)).toBe(false);
        expect(r).not.toHaveProperty('turretKey');
        expect(r).not.toHaveProperty('hullKey');
        expect(r).toMatchObject({ imageKey: `render-${r.id}`, imageUrl: expect.stringMatching(/\.png/) });
        // No pivot in the metadata: it turns about the canvas centre.
        expect(r.pivot).toEqual({ x: r.canvasPx / 2, y: r.canvasPx / 2 });
      }
  });

  it('gives every tower, the Tank and the Heavy tank a hull and a turret, both its own keys', () => {
    for (const kind of IN_PLAY.filter((k) => !SINGLE_IMAGE.includes(k)))
      for (const faction of FACTIONS) {
        const r = render(kind, faction);
        if (!isTurretRender(r)) throw new Error(`${r.id} has no turret`);
        expect(r.hullKey).toBe(`render-${r.id}-hull`);
        expect(r.turretKey).toBe(`render-${r.id}-turret`);
        expect(r.hullUrl).toMatch(/hull\.png/);
        expect(r.turretUrl).toMatch(/turret\.png/);
      }
  });

  it('reads the pivot from the render data: a tank off the canvas centre, a tower on its pad the centre', () => {
    const tank = render('tank', 'russia');
    expect(tank.canvasPx).toBe(192);
    expect(tank.pivot.y).toBeGreaterThan(96);
    // The AA Gun stands on its sandbagged pad (#316), so it turns about the pad centre.
    expect(render('aaGun', 'china')).toMatchObject({ canvasPx: 160, pivot: { x: 80, y: 80 } });
  });

  it('has a barrel tip per barrel: two on the China AA Gun, one on the Russia tank', () => {
    const [aa, tank] = [render('aaGun', 'china'), render('tank', 'russia')];
    if (!isTurretRender(aa) || !isTurretRender(tank)) throw new Error('turret kinds');
    expect(aa.muzzles).toHaveLength(2);
    expect(tank.muzzles).toHaveLength(1);
  });

  it('reads every barrel tip off its turret image: an opaque pixel ahead of the pivot', () => {
    for (const r of turretRenders()) {
      expect(r.muzzles.length, r.id).toBeGreaterThan(0);
      const png = PNG.sync.read(readFileSync(`assets/render-${r.id}/${r.id}-turret.png`));
      const opaqueNear = (cx: number, cy: number) => {
        for (let y = Math.round(cy) - 2; y <= Math.round(cy) + 2; y++)
          for (let x = Math.round(cx) - 2; x <= Math.round(cx) + 2; x++)
            if (x >= 0 && y >= 0 && x < png.width && y < png.height && png.data[(y * png.width + x) * 4 + 3]! > 128)
              return true;
        return false;
      };
      for (const m of r.muzzles) {
        expect(m.y, r.id).toBeLessThan(0);
        expect(opaqueNear(r.pivot.x + m.x, r.pivot.y + m.y), `${r.id} ${JSON.stringify(m)}`).toBe(true);
        // A tip is the front of the barrel: nothing opaque further forward in its column.
        const col = Math.round(r.pivot.x + m.x);
        const above = Array.from({ length: Math.max(0, Math.round(r.pivot.y + m.y) - 3) }, (_, y) => y).some(
          (y) => png.data[(y * png.width + col) * 4 + 3]! > 128,
        );
        expect(above, `${r.id} ${JSON.stringify(m)} has image ahead of it`).toBe(false);
      }
    }
  });

  it('renders face north', () => {
    expect(RENDER_FACING).toBeCloseTo(-Math.PI / 2);
  });

  it('keeps the Kenney frames the battlefield falls back to', () => {
    expect(SPRITES.aaGun).not.toBeNull();
    expect(SPRITES.tank).not.toBeNull();
    expect(SPRITES.gunship).toBeNull();
    expect(SPRITES.apc).toBeNull();
  });
});

describe('drawnRender (#567)', () => {
  const trainingGround = MAPS[0]!;
  const loaded = () => true;

  it('draws every in-play kind on Training Ground from its render: US towers, Russian enemies, never Kenney', () => {
    for (const kind of IN_PLAY) {
      const drawn = drawnRender(kind, trainingGround, loaded);
      const side = (BUILD_KINDS as readonly SpriteKind[]).includes(kind) ? 'us' : 'russia';
      expect(drawn?.id, kind).toBe(`${side}-${kebab(kind)}`);
    }
  });

  it("falls back to Kenney (null) when any of the render's textures is missing", () => {
    for (const kind of IN_PLAY) {
      const keys = renderKeys(drawnRender(kind, trainingGround, loaded)!);
      for (const missing of keys) {
        expect(
          drawnRender(kind, trainingGround, (key) => key !== missing),
          `${kind} without ${missing}`,
        ).toBeNull();
      }
    }
  });

  it('draws a kind not in play from Kenney', () => {
    for (const kind of [...NOT_IN_PLAY, ...NOT_PLAYABLE_KINDS] as SpriteKind[])
      expect(drawnRender(kind, trainingGround, loaded), kind).toBeNull();
  });
});

describe('renderKeys', () => {
  it('lists the hull and turret keys of a turret render, and the one image key of a single-image render', () => {
    expect(renderKeys(render('tank', 'russia'))).toEqual(['render-russia-tank-hull', 'render-russia-tank-turret']);
    expect(renderKeys(render('infantry', 'russia'))).toEqual(['render-russia-infantry']);
  });

  it('are the keys renderTextures loads', () => {
    const map = MAPS[0]!;
    const loadedKeys = renderTextures(map).map(({ key }) => key);
    for (const kind of IN_PLAY)
      for (const key of renderKeys(render(kind, factionFor(kind, map)))) expect(loadedKeys).toContain(key);
  });
});

describe('factionFor', () => {
  const map = { attacker: 'russia', defender: 'us' } as const;
  it('gives a tower the defender', () => {
    for (const kind of BUILD_KINDS) expect(factionFor(kind as TowerKind, map)).toBe('us');
  });
  it('gives an enemy the attacker', () => {
    for (const kind of PLAYABLE_KINDS) expect(factionFor(kind, map)).toBe('russia');
  });
});

describe('renderTextures', () => {
  const keysOf = (r: AnyRender) => (isTurretRender(r) ? [r.hullKey, r.turretKey] : [r.imageKey]);

  it('lists exactly the map’s two factions’ renders', () => {
    const map = { attacker: 'china', defender: 'insurgents' } as const;
    const expected = [
      ...BUILD_KINDS.map((k) => render(k, 'insurgents')),
      ...PLAYABLE_KINDS.map((k) => render(k, 'china')),
    ].flatMap(keysOf);
    const list = renderTextures(map);
    expect(list.map((t) => t.key).sort()).toEqual(expected.sort());
    for (const t of list) expect(t.url).toMatch(/\.png/);
    expect(list.some((t) => t.key.includes('-us-') || t.key.includes('-russia-'))).toBe(false);
  });

  it('loads the Training Ground pair: US towers, Russia enemies', () => {
    const keys = renderTextures(MAPS[0]!).map((t) => t.key);
    expect(keys).toContain('render-us-aa-gun-turret');
    expect(keys).toContain('render-russia-jeep');
    expect(keys).not.toContain('render-china-aa-gun-turret');
  });
});

describe('the committed Sniper renders (art-ahead: not in RENDERS until #364 puts the Sniper in play)', () => {
  // The Factions whose Sniper is rendered so far: US (#459), Russia and China (#460), Insurgents (#462): every Faction.
  for (const faction of FACTIONS) {
    const id = `${faction}-sniper`;
    const dir = `assets/render-${id}`;

    it(`${id} has its pivot data: a 1.25-tile canvas turning about the pad centre`, () => {
      const meta = JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'));
      expect(meta).toMatchObject({ id, kind: 'sniper', pxPerTile: 128, canvasPx: 160, pivot: { x: 80, y: 80 } });
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
      expect(ALL_RENDERS.map((r) => r.id)).not.toContain(id);
    });
  }
});

describe('the committed Grenade launcher renders (in play since #365)', () => {
  // Every Faction: US (#464), Russia (#467), China (#468), Insurgents (#469).
  for (const faction of FACTIONS) {
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

    it(`${id} has a turntable for the Field manual, within the 300 KB budget`, () => {
      const path = `${dir}/${id}-turntable.webp`;
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path).length).toBeLessThanOrEqual(TURNTABLE_BUDGET_BYTES);
      expect(JSON.parse(readFileSync(`${dir}/${id}-turntable.json`, 'utf8'))).toMatchObject({ id, frames: 24 });
    });

    it(`has ${id} in RENDERS, now it is in play`, () => {
      expect(ALL_RENDERS.map((r) => r.id)).toContain(id);
    });
  }
});

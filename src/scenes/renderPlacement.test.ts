import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../data/display';
import { RENDER_FACING } from '../data/renders';
import { MUZZLE_FALLBACK_PX, muzzlePoints, renderPlacement } from './renderPlacement';

const render = { pxPerTile: 128, canvasPx: 128, pivot: { x: 64.5, y: 80 } };

describe('renderPlacement', () => {
  it('scales 128 px a tile to TILE_PX', () => {
    expect(renderPlacement(render).scale).toBe(TILE_PX / 128);
  });

  it('turns the turret around its pivot: the origin is the pivot as a share of the canvas', () => {
    expect(renderPlacement(render).turretOrigin).toEqual({ x: 64.5 / 128, y: 80 / 128 });
  });

  it('puts the pivot where it sits over the hull, which is centred on the entity', () => {
    const { turretOffset, scale } = renderPlacement(render);
    expect(turretOffset).toEqual({ x: 0.5 * scale, y: 16 * scale });
  });

  it('keeps the same tile scale on a bigger canvas', () => {
    const tank = renderPlacement({ pxPerTile: 128, canvasPx: 192, pivot: { x: 95.5, y: 116.5 } });
    expect(tank.scale).toBe(TILE_PX / 128);
    expect(tank.turretOffset).toEqual({ x: -0.5 * tank.scale, y: 20.5 * tank.scale });
    expect(tank.turretOrigin).toEqual({ x: 95.5 / 192, y: 116.5 / 192 });
  });
});

describe('muzzlePoints', () => {
  const at = { x: 100, y: 200 };
  const gun = {
    ...render,
    canvasPx: 128,
    pivot: { x: 64, y: 64 },
    muzzles: [
      { x: -4, y: -60 },
      { x: 4, y: -60 },
    ],
  };

  it('puts each barrel tip over the hull, north of the pivot when the turret faces north', () => {
    const scale = TILE_PX / 128;
    const [a, b] = muzzlePoints(gun, at, RENDER_FACING);
    expect(a!.x).toBeCloseTo(100 - 4 * scale);
    expect(a!.y).toBeCloseTo(200 - 60 * scale);
    expect(b!.x).toBeCloseTo(100 + 4 * scale);
  });

  it('turns the tips with the turret: facing east puts them east, the pair split north–south', () => {
    const scale = TILE_PX / 128;
    const [a, b] = muzzlePoints(gun, at, 0);
    expect(a!.x).toBeCloseTo(100 + 60 * scale);
    expect(a!.y).toBeCloseTo(200 - 4 * scale);
    expect(b!.y).toBeCloseTo(200 + 4 * scale);
  });

  it('measures from the pivot, which sits off the hull centre', () => {
    const tank = { ...render, muzzles: [{ x: 0, y: -100 }] };
    const scale = TILE_PX / 128;
    const [m] = muzzlePoints(tank, at, RENDER_FACING);
    expect(m!.y).toBeCloseTo(200 + 16 * scale - 100 * scale);
  });

  it('gives a Kenney kind one tip a fixed way along the aim', () => {
    const [m, ...rest] = muzzlePoints(null, at, Math.PI / 2);
    expect(rest).toEqual([]);
    expect(m!.x).toBeCloseTo(100);
    expect(m!.y).toBeCloseTo(200 + MUZZLE_FALLBACK_PX);
  });
});

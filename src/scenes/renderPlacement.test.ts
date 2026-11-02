import { describe, expect, it } from 'vitest';
import { TILE_PX } from '../data/display';
import { renderPlacement } from './renderPlacement';

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

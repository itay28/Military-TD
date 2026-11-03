import { describe, expect, it } from 'vitest';
import { distanceVolume, viewCenter } from './distance';

const FALLOFF = { nearTiles: 4, farTiles: 14, minVolume: 0.2 };

describe('distanceVolume', () => {
  it('is full volume up to the near distance', () => {
    expect(distanceVolume(0, FALLOFF)).toBe(1);
    expect(distanceVolume(4, FALLOFF)).toBe(1);
  });

  it('falls off linearly to the floor at the far distance', () => {
    expect(distanceVolume(9, FALLOFF)).toBeCloseTo(0.6);
    expect(distanceVolume(14, FALLOFF)).toBeCloseTo(0.2);
  });

  it('never drops below the floor', () => {
    expect(distanceVolume(100, FALLOFF)).toBeCloseTo(0.2);
  });
});

describe('viewCenter', () => {
  it("is the world point at the middle of the camera's view, in tiles", () => {
    // 960 × 480 px at zoom 2 shows 480 × 240 world px from (96, 48): the middle is (336, 168) px = (7, 3.5) tiles.
    expect(viewCenter({ scrollX: 96, scrollY: 48, zoom: 2, width: 960, height: 480 }, 48)).toEqual({ x: 7, y: 3.5 });
  });
});

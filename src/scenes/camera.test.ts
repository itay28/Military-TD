import { describe, expect, it } from 'vitest';
import { clampView, fitView, fitZoom, panBy, screenToWorld, worldToScreen, zoomAt, zoomLimits } from './camera';

const WORLD = { width: 768, height: 480 };
/** A phone in portrait, with the build bar beside the map: much narrower than the map. */
const PHONE = { viewport: { width: 300, height: 700 }, world: WORLD, maxZoom: 2.5 };
/** A desktop window a little bigger than the map. */
const DESKTOP = { viewport: { width: 960, height: 600 }, world: WORLD, maxZoom: 2.5 };

describe('fitZoom', () => {
  it('is the zoom that fits the whole map on the tighter axis', () => {
    expect(fitZoom({ width: 384, height: 480 }, WORLD)).toBe(0.5);
    expect(fitZoom({ width: 1536, height: 480 }, WORLD)).toBe(1);
    expect(fitZoom(DESKTOP.viewport, WORLD)).toBe(1.25);
  });
});

describe('zoomLimits', () => {
  it('zooms out to the whole map and in to maxZoom', () => {
    expect(zoomLimits(PHONE)).toEqual({ min: 300 / 768, max: 2.5 });
  });

  it('never has a max below the fit, on a screen big enough to fit the map past maxZoom', () => {
    expect(zoomLimits({ ...DESKTOP, viewport: { width: 3072, height: 1920 } })).toEqual({ min: 4, max: 4 });
  });
});

describe('clampView', () => {
  it('keeps the zoom within its limits', () => {
    expect(clampView({ scrollX: 0, scrollY: 0, zoom: 0.1 }, PHONE).zoom).toBe(300 / 768);
    expect(clampView({ scrollX: 0, scrollY: 0, zoom: 9 }, PHONE).zoom).toBe(2.5);
  });

  it('centres the map on an axis where it is smaller than the screen', () => {
    // 300 px wide at zoom 1 shows 300 of 768 world px across, but 700 of 480 down: centred, 110 px above.
    const view = clampView({ scrollX: 100, scrollY: 0, zoom: 1 }, PHONE);
    expect(view).toEqual({ scrollX: 100, scrollY: -110, zoom: 1 });
  });

  it("can't scroll past the map's edges where it is bigger than the screen", () => {
    expect(clampView({ scrollX: -50, scrollY: 0, zoom: 1 }, PHONE).scrollX).toBe(0);
    expect(clampView({ scrollX: 900, scrollY: 0, zoom: 1 }, PHONE).scrollX).toBe(768 - 300);
    expect(clampView({ scrollX: 900, scrollY: 900, zoom: 2 }, PHONE)).toEqual({
      scrollX: 768 - 150,
      scrollY: 480 - 350,
      zoom: 2,
    });
  });
});

describe('fitView', () => {
  it('shows the whole map, centred', () => {
    expect(fitView(DESKTOP)).toEqual({ scrollX: 0, scrollY: 0, zoom: 1.25 });
    const phone = fitView(PHONE);
    expect(phone.zoom).toBe(300 / 768);
    expect(phone.scrollX).toBeCloseTo(0);
    expect(phone.scrollY).toBeCloseTo(-(700 / phone.zoom - 480) / 2);
  });
});

describe('screenToWorld and worldToScreen', () => {
  it('map a screen pixel through scroll and zoom, and back', () => {
    const view = { scrollX: 100, scrollY: 40, zoom: 2 };
    expect(screenToWorld(view, { x: 50, y: 20 })).toEqual({ x: 125, y: 50 });
    expect(worldToScreen(view, { x: 125, y: 50 })).toEqual({ x: 50, y: 20 });
  });
});

describe('panBy', () => {
  it('moves the map with the finger: dragging left scrolls right, by the drag over the zoom', () => {
    expect(panBy({ scrollX: 100, scrollY: 0, zoom: 2 }, -40, 0, PHONE)).toMatchObject({ scrollX: 120 });
  });

  it('stops at the edge of the map', () => {
    expect(panBy({ scrollX: 10, scrollY: 0, zoom: 1 }, 500, 0, PHONE).scrollX).toBe(0);
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the pointer where it is', () => {
    const before = { scrollX: 100, scrollY: 20, zoom: 1 };
    const pointer = { x: 150, y: 300 };
    const under = screenToWorld(before, pointer);
    const after = zoomAt(before, 1.5, pointer, PHONE);
    expect(after.zoom).toBe(1.5);
    const stillUnder = screenToWorld(after, pointer);
    expect(stillUnder.x).toBeCloseTo(under.x);
    expect(after.scrollY).toBeCloseTo(480 - 700 / 1.5); // y would show past the bottom edge, so it stops there
  });

  it('stops at the zoom limits', () => {
    expect(zoomAt({ scrollX: 0, scrollY: 0, zoom: 2 }, 4, { x: 0, y: 0 }, PHONE).zoom).toBe(2.5);
    expect(zoomAt(fitView(PHONE), 0.5, { x: 0, y: 0 }, PHONE)).toEqual(fitView(PHONE));
  });
});

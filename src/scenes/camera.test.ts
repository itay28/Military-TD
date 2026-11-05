import { describe, expect, it } from 'vitest';
import {
  panToReveal,
  canPlaceAt,
  revealTile,
  clampView,
  fitView,
  fitZoom,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomLimits,
} from './camera';

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

describe('canPlaceAt', () => {
  const zoomed = { scrollX: 200, scrollY: 100, zoom: 2 }; // shows world x 200..350, y 100..450 on the phone canvas

  it('accepts a point inside the canvas and the map', () => {
    expect(canPlaceAt(zoomed, PHONE, { x: 150, y: 300 })).toBe(true);
    expect(canPlaceAt(zoomed, PHONE, { x: 0, y: 0 })).toBe(true);
  });

  it('refuses a point outside the canvas, over the build bar or HUD beside it', () => {
    expect(canPlaceAt(zoomed, PHONE, { x: 300, y: 300 })).toBe(false);
    expect(canPlaceAt(zoomed, PHONE, { x: 350, y: 300 })).toBe(false);
    expect(canPlaceAt(zoomed, PHONE, { x: -1, y: 300 })).toBe(false);
    expect(canPlaceAt(zoomed, PHONE, { x: 150, y: -5 })).toBe(false);
    expect(canPlaceAt(zoomed, PHONE, { x: 150, y: 700 })).toBe(false);
  });

  it('refuses the same map tile off-screen after a zoom, and accepts it once panned into view', () => {
    const tile = { x: 600, y: 200 }; // inside the map (768x480)
    const offscreen = worldToScreen(zoomed, tile);
    expect(canPlaceAt(zoomed, PHONE, offscreen)).toBe(false);
    const panned = panBy(zoomed, -offscreen.x + 100, 0, PHONE);
    expect(canPlaceAt(panned, PHONE, worldToScreen(panned, tile))).toBe(true);
  });

  it('refuses a point on the margin around a map smaller than the canvas', () => {
    const view = fitView(DESKTOP);
    const margin = worldToScreen(view, { x: -10, y: 100 });
    expect(canPlaceAt(view, DESKTOP, margin)).toBe(false);
    expect(canPlaceAt(view, DESKTOP, worldToScreen(view, { x: 10, y: 100 }))).toBe(true);
  });
});

describe('revealTile', () => {
  /** Zoomed in on a desktop: 480×300 world pixels visible, from (100, 50). */
  const view = { scrollX: 100, scrollY: 50, zoom: 2 };
  const tile = (x: number, y: number) => ({ x, y, width: 32, height: 32 });

  it('leaves the camera alone while the rectangle is on screen', () => {
    expect(revealTile(view, DESKTOP, tile(200, 100))).toEqual(view);
  });

  it('pans the least that brings the rectangle on screen, on each side', () => {
    expect(revealTile(view, DESKTOP, tile(68, 100))).toEqual({ ...view, scrollX: 68 });
    expect(revealTile(view, DESKTOP, tile(580, 100))).toEqual({ ...view, scrollX: 132 });
    expect(revealTile(view, DESKTOP, tile(200, 30))).toEqual({ ...view, scrollY: 30 });
    expect(revealTile(view, DESKTOP, tile(200, 330))).toEqual({ ...view, scrollY: 62 });
  });

  it('keeps the camera inside the map', () => {
    expect(revealTile(view, DESKTOP, tile(736, 448))).toEqual({ ...view, scrollX: 288, scrollY: 180 });
  });
});

describe('panToReveal', () => {
  const bounds = { viewport: { width: 400, height: 300 }, world: { width: 1000, height: 800 }, maxZoom: 3 };
  const view = { scrollX: 200, scrollY: 100, zoom: 1 };
  const margin = 40;

  it('leaves the view alone when the point is on screen', () => {
    expect(panToReveal(view, { x: 400, y: 250 }, margin, bounds)).toBe(view);
  });

  it('centres the point when it is off screen', () => {
    expect(panToReveal(view, { x: 800, y: 600 }, margin, bounds)).toEqual({ scrollX: 600, scrollY: 450, zoom: 1 });
  });

  it('centres it when it is inside the margin of the edge', () => {
    expect(panToReveal(view, { x: 210, y: 250 }, margin, bounds)).toEqual({ scrollX: 10, scrollY: 100, zoom: 1 });
  });

  it('stays inside the map at its corner', () => {
    expect(panToReveal(view, { x: 990, y: 790 }, margin, bounds)).toEqual({ scrollX: 600, scrollY: 500, zoom: 1 });
  });
});

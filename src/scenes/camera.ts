import type { Pixel } from './coords';

// Pan and zoom of the map, as pure math so it is tested without Phaser. The camera's origin is its top-left
// corner, so a screen pixel shows the world point `scroll + screen / zoom`.

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where the camera looks: the world pixel at the canvas's top-left corner, and the zoom. */
export interface CameraView {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly zoom: number;
}

/** What limits the camera: the canvas size on screen, the map's size in world pixels, and how far it zooms in. */
export interface CameraBounds {
  readonly viewport: Size;
  readonly world: Size;
  readonly maxZoom: number;
}

/** The zoom that fits the whole map on the screen. */
export function fitZoom(viewport: Size, world: Size): number {
  return Math.min(viewport.width / world.width, viewport.height / world.height);
}

/** From the whole map on screen, to `maxZoom` (or the fit, on a screen big enough to fit the map past it). */
export function zoomLimits({ viewport, world, maxZoom }: CameraBounds): { min: number; max: number } {
  const min = fitZoom(viewport, world);
  return { min, max: Math.max(maxZoom, min) };
}

/** The scroll on one axis: centred where the map is smaller than the screen, else kept inside the map. */
function clampAxis(scroll: number, visible: number, world: number): number {
  if (visible >= world) return (world - visible) / 2;
  return Math.min(Math.max(scroll, 0), world - visible);
}

/** `view` with its zoom within limits and its scroll showing no space past the map's edges. */
export function clampView(view: CameraView, bounds: CameraBounds): CameraView {
  const { min, max } = zoomLimits(bounds);
  const zoom = Math.min(Math.max(view.zoom, min), max);
  const { viewport, world } = bounds;
  return {
    scrollX: clampAxis(view.scrollX, viewport.width / zoom, world.width),
    scrollY: clampAxis(view.scrollY, viewport.height / zoom, world.height),
    zoom,
  };
}

/** The whole map, centred: how the game starts. */
export function fitView(bounds: CameraBounds): CameraView {
  return clampView({ scrollX: 0, scrollY: 0, zoom: fitZoom(bounds.viewport, bounds.world) }, bounds);
}

export function screenToWorld({ scrollX, scrollY, zoom }: CameraView, { x, y }: Pixel): Pixel {
  return { x: scrollX + x / zoom, y: scrollY + y / zoom };
}

export function worldToScreen({ scrollX, scrollY, zoom }: CameraView, { x, y }: Pixel): Pixel {
  return { x: (x - scrollX) * zoom, y: (y - scrollY) * zoom };
}

/** Moves the map with a drag of `dx`, `dy` screen pixels, so the point under the finger stays under it. */
export function panBy(view: CameraView, dx: number, dy: number, bounds: CameraBounds): CameraView {
  return clampView({ ...view, scrollX: view.scrollX - dx / view.zoom, scrollY: view.scrollY - dy / view.zoom }, bounds);
}

/** Zooms by `factor` around the screen pixel `at`, which keeps showing the same world point (within the limits). */
export function zoomAt(view: CameraView, factor: number, at: Pixel, bounds: CameraBounds): CameraView {
  const { min, max } = zoomLimits(bounds);
  const zoom = Math.min(Math.max(view.zoom * factor, min), max);
  const under = screenToWorld(view, at);
  return clampView({ scrollX: under.x - at.x / zoom, scrollY: under.y - at.y / zoom, zoom }, bounds);
}

/**
 * Whether a placement at screen point `at` may land: the point is on the visible canvas (so not over the build bar,
 * the HUD or past the screen edge) and shows a point of the map (so not the margin around a small map).
 */
export function canPlaceAt(view: CameraView, { viewport, world }: CameraBounds, at: Pixel): boolean {
  if (at.x < 0 || at.y < 0 || at.x >= viewport.width || at.y >= viewport.height) return false;
  const point = screenToWorld(view, at);
  return point.x >= 0 && point.y >= 0 && point.x < world.width && point.y < world.height;
}

/** A rectangle in world pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The smallest pan that brings `rect` on screen (the camera following the map cursor), kept inside the map. */
export function revealTile(view: CameraView, bounds: CameraBounds, rect: Rect): CameraView {
  const reveal = (scroll: number, visible: number, start: number, size: number) =>
    start < scroll ? start : start + size > scroll + visible ? start + size - visible : scroll;
  const scrollX = reveal(view.scrollX, bounds.viewport.width / view.zoom, rect.x, rect.width);
  const scrollY = reveal(view.scrollY, bounds.viewport.height / view.zoom, rect.y, rect.height);
  if (scrollX === view.scrollX && scrollY === view.scrollY) return view;
  return clampView({ ...view, scrollX, scrollY }, bounds);
}

/**
 * `view` as it is when the world point `at` is at least `margin` screen pixels inside the canvas, else centred on it
 * (within the map). Returns `view` itself when nothing needs to move.
 */
export function panToReveal(view: CameraView, at: Pixel, margin: number, bounds: CameraBounds): CameraView {
  const { x, y } = worldToScreen(view, at);
  const { width, height } = bounds.viewport;
  if (x >= margin && y >= margin && x <= width - margin && y <= height - margin) return view;
  return clampView(
    { ...view, scrollX: at.x - width / (2 * view.zoom), scrollY: at.y - height / (2 * view.zoom) },
    bounds,
  );
}

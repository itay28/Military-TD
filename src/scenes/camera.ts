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

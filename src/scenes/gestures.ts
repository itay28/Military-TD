import type { Pixel } from './coords';

/**
 * What the pointers on the canvas did: a tap acts on the map, a pan or pinch moves the camera. A touch drag with a
 * build kind selected aims the Ghost instead, and places the tower where it lifts.
 */
export type Gesture =
  | { readonly type: 'tap'; readonly point: Pixel }
  /** Show the Ghost under `point`. */
  | { readonly type: 'aim'; readonly point: Pixel }
  /** Place the selected kind under `point`, where an aiming drag lifted. */
  | { readonly type: 'place'; readonly point: Pixel }
  | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
  /** Zoom by `factor` around `center`, after panning by how far the midpoint of the two fingers moved. */
  | {
      readonly type: 'pinch';
      readonly factor: number;
      readonly center: Pixel;
      readonly dx: number;
      readonly dy: number;
    };

export interface Gestures {
  /** `touch` is whether a finger pressed, rather than a mouse button. */
  down(id: number, point: Pixel, touch?: boolean): Gesture | undefined;
  move(id: number, point: Pixel): Gesture | undefined;
  up(id: number, point: Pixel): Gesture | undefined;
  /** Forgets every pointer, e.g. when the pointer leaves the canvas. */
  cancel(): void;
}

const midpoint = (a: Pixel, b: Pixel): Pixel => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Tells a tap from a drag or a pinch, from screen-pixel pointer events. A press that moves less than
 * `dragThresholdPx` and lifts is a tap; past it, the press pans. Two pointers down pinch. Once a press has
 * panned or pinched, nothing taps until every pointer is up, so moving the map never places a tower.
 *
 * A one-finger touch press that starts while `placing()` (a build kind is selected) aims instead of panning: it
 * aims on every move, and past the threshold it places where it lifts. A second finger turns it into a pinch, which
 * places nothing. Mouse presses always pan, since a mouse aims by hovering.
 */
export function createGestures({
  dragThresholdPx,
  placing,
}: {
  readonly dragThresholdPx: number;
  readonly placing: () => boolean;
}): Gestures {
  /** Each pointer down, where it is now. */
  const pointers = new Map<number, Pixel>();
  let start: Pixel | undefined;
  /** Whether this press has panned or pinched, so it no longer taps. */
  let moved = false;
  /** Whether this press aims the Ghost rather than moving the camera. */
  let aiming = false;
  /** Whether the aiming press went past the threshold, so it places rather than taps. */
  let dragged = false;

  const reset = () => {
    pointers.clear();
    start = undefined;
    moved = false;
    aiming = false;
    dragged = false;
  };

  return {
    down(id, point, touch = false) {
      pointers.set(id, point);
      if (pointers.size === 1 && !moved) {
        start = point;
        aiming = touch && placing();
        return aiming ? { type: 'aim', point } : undefined;
      }
      moved = true;
      aiming = false;
      return undefined;
    },
    move(id, point) {
      const last = pointers.get(id);
      if (!last) return undefined;
      if (pointers.size >= 2) {
        // Two or more pointers are down, so one other than this one is.
        const [, other] = [...pointers].find(([otherId]) => otherId !== id)!;
        pointers.set(id, point);
        const before = Math.hypot(last.x - other.x, last.y - other.y);
        const after = Math.hypot(point.x - other.x, point.y - other.y);
        const from = midpoint(last, other);
        const center = midpoint(point, other);
        return {
          type: 'pinch',
          factor: before > 0 ? after / before : 1,
          center,
          dx: center.x - from.x,
          dy: center.y - from.y,
        };
      }
      const fromStart = start ? Math.hypot(point.x - start.x, point.y - start.y) : 0;
      if (aiming) {
        pointers.set(id, point);
        dragged ||= fromStart >= dragThresholdPx;
        return { type: 'aim', point };
      }
      if (!moved) {
        if (!start || fromStart < dragThresholdPx) return undefined;
        moved = true;
        pointers.set(id, point);
        return { type: 'pan', dx: point.x - start.x, dy: point.y - start.y };
      }
      pointers.set(id, point);
      return { type: 'pan', dx: point.x - last.x, dy: point.y - last.y };
    },
    up(id, point) {
      if (!pointers.delete(id)) return undefined;
      if (pointers.size > 0) return undefined;
      const gesture: Gesture | undefined =
        aiming && dragged ? { type: 'place', point } : moved ? undefined : { type: 'tap', point };
      reset();
      return gesture;
    },
    cancel: reset,
  };
}

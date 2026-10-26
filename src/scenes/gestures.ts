import type { Pixel } from './coords';

/** What the pointers on the canvas did: a tap acts on the map, a pan or pinch moves the camera. */
export type Gesture =
  | { readonly type: 'tap'; readonly point: Pixel }
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
  down(id: number, point: Pixel): Gesture | undefined;
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
 */
export function createGestures({ dragThresholdPx }: { readonly dragThresholdPx: number }): Gestures {
  /** Each pointer down, where it is now. */
  const pointers = new Map<number, Pixel>();
  let start: Pixel | undefined;
  /** Whether this press has panned or pinched, so it no longer taps. */
  let moved = false;

  const reset = () => {
    pointers.clear();
    start = undefined;
    moved = false;
  };

  return {
    down(id, point) {
      pointers.set(id, point);
      if (pointers.size === 1 && !moved) start = point;
      else moved = true;
      return undefined;
    },
    move(id, point) {
      const last = pointers.get(id);
      if (!last) return undefined;
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.entries()].filter(([other]) => other !== id).map(([, p]) => p);
        const other = a ?? b!;
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
      if (!moved) {
        if (!start || Math.hypot(point.x - start.x, point.y - start.y) < dragThresholdPx) return undefined;
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
      const tapped = !moved;
      reset();
      return tapped ? { type: 'tap', point } : undefined;
    },
    cancel: reset,
  };
}

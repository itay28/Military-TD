import { describe, expect, it } from 'vitest';
import { createGestures } from './gestures';

const THRESHOLD = 8;
const gestures = (placing = false) => createGestures({ dragThresholdPx: THRESHOLD, placing: () => placing });

describe('gestures', () => {
  it('a press and release in place is a tap where it was released', () => {
    const g = gestures();
    expect(g.down(1, { x: 10, y: 10 })).toBeUndefined();
    expect(g.up(1, { x: 12, y: 11 })).toEqual({ type: 'tap', point: { x: 12, y: 11 } });
  });

  it('moving less than the threshold is still a tap', () => {
    const g = gestures();
    g.down(1, { x: 10, y: 10 });
    expect(g.move(1, { x: 15, y: 10 })).toBeUndefined();
    expect(g.up(1, { x: 15, y: 10 })).toMatchObject({ type: 'tap' });
  });

  it('moving past the threshold pans by the whole drag so far, then by each move', () => {
    const g = gestures();
    g.down(1, { x: 10, y: 10 });
    expect(g.move(1, { x: 20, y: 14 })).toEqual({ type: 'pan', dx: 10, dy: 4 });
    expect(g.move(1, { x: 25, y: 10 })).toEqual({ type: 'pan', dx: 5, dy: -4 });
  });

  it('a drag ends without a tap, even if it comes back to where it started', () => {
    const g = gestures();
    g.down(1, { x: 10, y: 10 });
    g.move(1, { x: 40, y: 10 });
    g.move(1, { x: 10, y: 10 });
    expect(g.up(1, { x: 10, y: 10 })).toBeUndefined();
  });

  it('ignores moves of a pointer that is not down, like a mouse hovering', () => {
    const g = gestures();
    expect(g.move(1, { x: 100, y: 100 })).toBeUndefined();
    expect(g.up(1, { x: 100, y: 100 })).toBeUndefined();
  });

  it('two fingers pinch: zoom by the change in their distance, around their midpoint', () => {
    const g = gestures();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    expect(g.move(2, { x: 300, y: 100 })).toEqual({
      type: 'pinch',
      factor: 2,
      center: { x: 200, y: 100 },
      dx: 50,
      dy: 0,
    });
  });

  it('a pinch ends without a tap, and the finger left down pans', () => {
    const g = gestures();
    g.down(1, { x: 100, y: 100 });
    g.down(2, { x: 200, y: 100 });
    expect(g.up(2, { x: 200, y: 100 })).toBeUndefined();
    expect(g.move(1, { x: 103, y: 100 })).toEqual({ type: 'pan', dx: 3, dy: 0 });
    expect(g.up(1, { x: 103, y: 100 })).toBeUndefined();
  });

  it('a new press after everything is released can tap again', () => {
    const g = gestures();
    g.down(1, { x: 0, y: 0 });
    g.down(2, { x: 50, y: 0 });
    g.up(1, { x: 0, y: 0 });
    g.up(2, { x: 50, y: 0 });
    g.down(3, { x: 5, y: 5 });
    expect(g.up(3, { x: 5, y: 5 })).toEqual({ type: 'tap', point: { x: 5, y: 5 } });
  });

  it('cancel() forgets every pointer', () => {
    const g = gestures();
    g.down(1, { x: 0, y: 0 });
    g.cancel();
    expect(g.up(1, { x: 0, y: 0 })).toBeUndefined();
  });

  describe('with a kind selected, a touch press aims the Ghost', () => {
    it('a drag aims at each point and lifting places at the lift point', () => {
      const g = gestures(true);
      expect(g.down(1, { x: 10, y: 10 }, true)).toEqual({ type: 'aim', point: { x: 10, y: 10 } });
      expect(g.move(1, { x: 40, y: 10 })).toEqual({ type: 'aim', point: { x: 40, y: 10 } });
      expect(g.move(1, { x: 70, y: 20 })).toEqual({ type: 'aim', point: { x: 70, y: 20 } });
      expect(g.up(1, { x: 72, y: 21 })).toEqual({ type: 'place', point: { x: 72, y: 21 } });
    });

    it('a short press is still a tap, so a tap on a tower selects it', () => {
      const g = gestures(true);
      g.down(1, { x: 10, y: 10 }, true);
      g.move(1, { x: 13, y: 10 });
      expect(g.up(1, { x: 13, y: 10 })).toEqual({ type: 'tap', point: { x: 13, y: 10 } });
    });

    it('a second finger pinches, and nothing is placed on lift', () => {
      const g = gestures(true);
      g.down(1, { x: 100, y: 100 }, true);
      g.move(1, { x: 130, y: 100 });
      expect(g.down(2, { x: 200, y: 100 }, true)).toBeUndefined();
      expect(g.move(2, { x: 270, y: 100 })).toMatchObject({ type: 'pinch', factor: 2 });
      expect(g.up(2, { x: 270, y: 100 })).toBeUndefined();
      expect(g.move(1, { x: 140, y: 100 })).toEqual({ type: 'pan', dx: 10, dy: 0 });
      expect(g.up(1, { x: 140, y: 100 })).toBeUndefined();
    });

    it('cancel() places nothing', () => {
      const g = gestures(true);
      g.down(1, { x: 10, y: 10 }, true);
      g.move(1, { x: 60, y: 10 });
      g.cancel();
      expect(g.up(1, { x: 60, y: 10 })).toBeUndefined();
    });

    it('asks whether it is placing when the press starts', () => {
      let placing = false;
      const g = createGestures({ dragThresholdPx: THRESHOLD, placing: () => placing });
      g.down(1, { x: 10, y: 10 }, true);
      placing = true;
      expect(g.move(1, { x: 40, y: 10 })).toEqual({ type: 'pan', dx: 30, dy: 0 });
      expect(g.up(1, { x: 40, y: 10 })).toBeUndefined();
    });
  });

  it('with nothing selected, a touch drag pans as before', () => {
    const g = gestures(false);
    expect(g.down(1, { x: 10, y: 10 }, true)).toBeUndefined();
    expect(g.move(1, { x: 40, y: 10 })).toEqual({ type: 'pan', dx: 30, dy: 0 });
    expect(g.up(1, { x: 40, y: 10 })).toBeUndefined();
  });

  it('with a kind selected, a mouse drag still pans and places nothing', () => {
    const g = gestures(true);
    expect(g.down(1, { x: 10, y: 10 })).toBeUndefined();
    expect(g.move(1, { x: 40, y: 10 })).toEqual({ type: 'pan', dx: 30, dy: 0 });
    expect(g.up(1, { x: 40, y: 10 })).toBeUndefined();
  });
});

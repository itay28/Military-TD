import { describe, expect, it } from 'vitest';
import { createBlasts, shellPoint } from './shellView';

const SHELL = { from: { x: 0, y: 0 }, target: { x: 10, y: 20 }, firedAtMs: 1000, landsAtMs: 2000 };

describe('shellPoint', () => {
  it('moves in a straight line from the tower to the target over the flight time, on sim time', () => {
    expect(shellPoint(SHELL, 1000)).toEqual({ x: 0, y: 0 });
    expect(shellPoint(SHELL, 1500)).toEqual({ x: 5, y: 10 });
    expect(shellPoint(SHELL, 2000)).toEqual({ x: 10, y: 20 });
  });

  it('stays within the flight if the clock is off by a tick', () => {
    expect(shellPoint(SHELL, 900)).toEqual({ x: 0, y: 0 });
    expect(shellPoint(SHELL, 2100)).toEqual({ x: 10, y: 20 });
  });

  it('a shell with no flight time is already at its target', () => {
    expect(shellPoint({ ...SHELL, landsAtMs: 1000 }, 1000)).toEqual({ x: 10, y: 20 });
  });
});

describe('createBlasts', () => {
  it('shows a new blast at full alpha, fading linearly on frame time, then drops it', () => {
    const blasts = createBlasts(200);
    blasts.add({ x: 5, y: 5 }, 30);
    expect(blasts.active()).toEqual([{ center: { x: 5, y: 5 }, radius: 30, alpha: 1 }]);
    blasts.advance(100);
    expect(blasts.active()[0]?.alpha).toBeCloseTo(0.5);
    blasts.advance(100);
    expect(blasts.active()).toEqual([]);
  });

  it('never shows a blast with no fade time, for ?anim=0', () => {
    const blasts = createBlasts(0);
    blasts.add({ x: 5, y: 5 }, 30);
    expect(blasts.active()).toEqual([]);
  });
});

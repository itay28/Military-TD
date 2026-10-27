import { describe, expect, it } from 'vitest';
import { createFixedStep } from './fixedStep';
import { MAX_GAME_SPEED } from './gameSpeed';

const STEP = 1000 / 60;

function setup(maxStepsPerFrame = 5) {
  const steps: number[] = [];
  const loop = createFixedStep({ stepMs: STEP, maxStepsPerFrame, step: (dtMs) => steps.push(dtMs) });
  return { loop, steps };
}

describe('createFixedStep', () => {
  it('runs one step per 1/60 s frame', () => {
    const { loop, steps } = setup();
    expect([loop.advance(STEP), loop.advance(STEP), loop.advance(STEP)]).toEqual([1, 1, 1]);
    expect(steps).toHaveLength(3);
  });

  it('carries leftover time across frames', () => {
    const { loop } = setup();
    expect(loop.advance(10)).toBe(0);
    expect(loop.advance(10)).toBe(1);
  });

  it('runs several steps for a long frame', () => {
    const { loop } = setup();
    expect(loop.advance(50)).toBe(3);
  });

  it('caps steps per frame and drops the backlog, so a stall cannot snowball', () => {
    const { loop } = setup(5);
    expect(loop.advance(1000)).toBe(5);
    expect(loop.advance(STEP)).toBe(1);
  });

  it('with the cap scaled by the game speed, runs 4 steps for one 60 fps frame at ×4', () => {
    const { loop } = setup(5 * MAX_GAME_SPEED);
    expect(loop.advance(STEP * MAX_GAME_SPEED)).toBe(4);
    expect(loop.advance(1000)).toBe(5 * MAX_GAME_SPEED);
  });

  it('ignores negative and non-finite frame deltas', () => {
    const { loop, steps } = setup();
    expect([loop.advance(-100), loop.advance(NaN), loop.advance(Infinity)]).toEqual([0, 0, 0]);
    expect(loop.advance(STEP)).toBe(1);
    expect(steps).toHaveLength(1);
  });

  it('passes stepMs as dtMs to every step', () => {
    const { loop, steps } = setup();
    loop.advance(40);
    expect(steps).toEqual([STEP, STEP]);
  });

  it('reports the leftover time as a fraction of a step, for interpolating between steps', () => {
    const { loop } = setup();
    expect(loop.alpha).toBe(0);
    loop.advance(STEP * 1.25);
    expect(loop.alpha).toBeCloseTo(0.25);
    loop.advance(STEP * 0.5);
    expect(loop.alpha).toBeCloseTo(0.75);
  });

  it('resets alpha to 0 when a stall drops the backlog', () => {
    const { loop } = setup(5);
    loop.advance(1000);
    expect(loop.alpha).toBe(0);
  });
});

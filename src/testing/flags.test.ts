import { describe, expect, it } from 'vitest';
import { frameMs, parseTestFlags } from './flags';

describe('parseTestFlags', () => {
  it('with no flags, test mode is off and the game runs in real time with animation', () => {
    expect(parseTestFlags('')).toEqual({ test: false, manualStep: false, anim: true, speed: 1 });
  });

  it('reads test=1, step=manual, anim=0 and speed=N', () => {
    expect(parseTestFlags('?test=1&step=manual&anim=0&speed=4')).toEqual({
      test: true,
      manualStep: true,
      anim: false,
      speed: 4,
    });
  });

  it('ignores other values of the flags', () => {
    expect(parseTestFlags('?test=yes&step=auto&anim=1')).toEqual({
      test: false,
      manualStep: false,
      anim: true,
      speed: 1,
    });
  });

  it.each(['0', '-2', 'fast', 'Infinity', ''])('falls back to speed 1 for speed=%s', (speed) => {
    expect(parseTestFlags(`?speed=${speed}`).speed).toBe(1);
  });

  it('takes a fractional speed, for slow motion', () => {
    expect(parseTestFlags('?speed=0.5').speed).toBe(0.5);
  });
});

describe('frameMs', () => {
  it('feeds the frame time through unchanged by default', () => {
    expect(frameMs(parseTestFlags(''), 16)).toBe(16);
  });

  it('feeds nothing with step=manual, so only step() advances the game', () => {
    expect(frameMs(parseTestFlags('?step=manual&speed=4'), 16)).toBe(0);
  });

  it('scales the frame time by speed', () => {
    expect(frameMs(parseTestFlags('?speed=4'), 16)).toBe(64);
  });

  it('scales a frame by the game speed', () => {
    expect(frameMs(parseTestFlags(''), 16, 4)).toBe(64);
  });

  it('multiplies the game speed by the speed flag', () => {
    expect(frameMs(parseTestFlags('?speed=3'), 16, 2)).toBe(96);
  });

  it.each([1, 2, 4] as const)('feeds nothing with step=manual at game speed ×%i', (gameSpeed) => {
    expect(frameMs(parseTestFlags('?step=manual'), 16, gameSpeed)).toBe(0);
  });
});

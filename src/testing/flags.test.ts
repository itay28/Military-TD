import { describe, expect, it } from 'vitest';
import { firstScene, frameMs, parseTestFlags } from './flags';

describe('parseTestFlags', () => {
  it('with no flags, test mode is off and the game runs in real time with animation', () => {
    expect(parseTestFlags('')).toEqual({ test: false, manualStep: false, anim: true, speed: 1, menu: false });
  });

  it('reads test=1, step=manual, anim=0 and speed=N', () => {
    expect(parseTestFlags('?test=1&step=manual&anim=0&speed=4')).toEqual({
      test: true,
      manualStep: true,
      anim: false,
      speed: 4,
      menu: false,
    });
  });

  it('ignores other values of the flags', () => {
    expect(parseTestFlags('?test=yes&step=auto&anim=1')).toEqual({
      test: false,
      manualStep: false,
      anim: true,
      speed: 1,
      menu: false,
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
});

describe('firstScene', () => {
  it('opens the Main menu for a player', () => {
    expect(firstScene(parseTestFlags(''))).toBe('Menu');
  });

  it('goes straight to the Game in test mode, so specs start in the Build phase', () => {
    expect(firstScene(parseTestFlags('?test=1'))).toBe('Game');
  });

  it('opens the Main menu in test mode with menu=1', () => {
    expect(parseTestFlags('?test=1&menu=1').menu).toBe(true);
    expect(firstScene(parseTestFlags('?test=1&menu=1'))).toBe('Menu');
  });
});

import { describe, expect, it } from 'vitest';
import { ENEMY_ANIM } from '../data/display';
import { animFrame, bobScale, rotorAngle } from './enemyAnim';

describe('animFrame', () => {
  const { frameMs, frames, phaseMs } = ENEMY_ANIM;

  it('starts at frame 0 and steps one frame every frameMs, wrapping round', () => {
    expect(animFrame(0, 0)).toBe(0);
    expect(animFrame(frameMs - 1, 0)).toBe(0);
    expect(animFrame(frameMs, 0)).toBe(1);
    expect(animFrame(frames * frameMs, 0)).toBe(0);
  });

  it('offsets each enemy by its id, so a group does not move in lockstep', () => {
    expect(phaseMs % (frames * frameMs)).not.toBe(0);
    expect(animFrame(0, 1)).not.toBe(animFrame(0, 0));
  });

  it('stays in range for every time and id', () => {
    for (let t = 0; t < 2000; t += 37) for (let id = 0; id < 5; id++) expect(animFrame(t, id)).toBeLessThan(frames);
  });
});

describe('bobScale and rotorAngle', () => {
  it('pulses a ground sprite between rest and a slightly larger scale', () => {
    expect(bobScale(0)).toBe(1);
    expect(bobScale(1)).toBeGreaterThan(1);
    expect(bobScale(1)).toBeLessThan(1.1);
  });

  it('turns the rotor in even steps that loop: an X looks the same every quarter turn', () => {
    const angles = Array.from({ length: ENEMY_ANIM.frames }, (_, f) => rotorAngle(f));
    expect(angles[0]).toBe(0);
    const step = Math.PI / 2 / ENEMY_ANIM.frames;
    angles.forEach((angle, f) => expect(angle).toBeCloseTo(f * step));
  });
});

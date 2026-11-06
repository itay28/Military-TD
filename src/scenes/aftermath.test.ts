import { describe, expect, it } from 'vitest';
import { AFTERMATH_OF } from '../data/display';
import { ENEMY_STATS } from '../data/enemies';
import { aftermathTimings, createAftermath, type AftermathTimings } from './aftermath';

const AT = { x: 24, y: 48 };
const SHAPE = { heading: 1, size: 10 };

const TIMINGS: AftermathTimings = {
  wreck: { holdMs: 3000, fadeMs: 5000, burns: true },
  crashMark: { holdMs: 3000, fadeMs: 5000, burns: true },
  crater: { holdMs: 0, fadeMs: 10000, burns: false },
  fallen: { holdMs: 0, fadeMs: 3000, burns: false, fallMs: 250 },
  evictFadeMs: 300,
};

const make = (cap = 40, timings = TIMINGS) => createAftermath({ cap, timings });

describe('createAftermath', () => {
  it('shows a new decal at its place, opaque', () => {
    const aftermath = make();
    aftermath.add('crater', AT, SHAPE);
    expect(aftermath.active()).toEqual([
      { kind: 'crater', at: AT, heading: 1, size: 10, alpha: 1, fireMs: undefined, fall: 1 },
    ]);
  });

  it('holds a wreck opaque while it burns, then fades it out and drops it', () => {
    const aftermath = make();
    aftermath.add('wreck', AT, SHAPE);
    aftermath.advance(2000);
    expect(aftermath.active()[0]).toMatchObject({ alpha: 1, fireMs: 2000 });
    aftermath.advance(3500); // 2.5 s into a 5 s fade
    expect(aftermath.active()[0]?.alpha).toBeCloseTo(0.5);
    expect(aftermath.active()[0]?.fireMs).toBeUndefined();
    aftermath.advance(2500);
    expect(aftermath.active()).toEqual([]);
  });

  it('fades a crater from the start', () => {
    const aftermath = make();
    aftermath.add('crater', AT, SHAPE);
    aftermath.advance(2500);
    expect(aftermath.active()[0]?.alpha).toBeCloseTo(0.75);
  });

  it('tips fallen infantry over, then fades them', () => {
    const aftermath = make();
    aftermath.add('fallen', AT, SHAPE);
    expect(aftermath.active()[0]?.fall).toBe(0);
    aftermath.advance(125);
    expect(aftermath.active()[0]?.fall).toBeCloseTo(0.5);
    aftermath.advance(1375);
    expect(aftermath.active()[0]).toMatchObject({ fall: 1 });
    expect(aftermath.active()[0]?.alpha).toBeCloseTo(0.5);
    aftermath.advance(1500);
    expect(aftermath.active()).toEqual([]);
  });

  it('never burns a decal kind that does not burn', () => {
    const aftermath = make();
    aftermath.add('crater', AT, SHAPE);
    aftermath.advance(10);
    expect(aftermath.active()[0]?.fireMs).toBeUndefined();
  });

  it('never shows a decal with no life, for ?anim=0', () => {
    const none = { holdMs: 0, fadeMs: 0, burns: false };
    const aftermath = make(40, {
      wreck: none,
      crashMark: none,
      crater: none,
      fallen: { ...none, fallMs: 0 },
      evictFadeMs: 0,
    });
    aftermath.add('wreck', AT, SHAPE);
    aftermath.add('fallen', AT, SHAPE);
    expect(aftermath.active()).toEqual([]);
  });

  it('fades the oldest out quickly once over the cap, without counting it', () => {
    const aftermath = make(2);
    aftermath.add('crater', { x: 1, y: 0 }, SHAPE);
    aftermath.add('crater', { x: 2, y: 0 }, SHAPE);
    aftermath.add('crater', { x: 3, y: 0 }, SHAPE);
    const [oldest, ...rest] = aftermath.active();
    expect(oldest).toMatchObject({ at: { x: 1, y: 0 }, alpha: 1 });
    expect(rest.map((d) => d.at.x)).toEqual([2, 3]);
    aftermath.advance(150);
    expect(aftermath.active()[0]?.alpha).toBeLessThan(0.55); // half the quick fade, on top of the crater's own
    aftermath.advance(150);
    expect(aftermath.active().map((d) => d.at.x)).toEqual([2, 3]);
  });

  it('a burning wreck evicted over the cap stops burning', () => {
    const aftermath = make(1);
    aftermath.add('wreck', { x: 1, y: 0 }, SHAPE);
    aftermath.add('crater', { x: 2, y: 0 }, SHAPE);
    expect(aftermath.active()[0]?.fireMs).toBeUndefined();
  });

  it('never keeps more than twice the cap, dropping the oldest outright', () => {
    const aftermath = make(3);
    for (let x = 0; x < 20; x++) aftermath.add('crater', { x, y: 0 }, SHAPE);
    expect(aftermath.active().map((d) => d.at.x)).toEqual([14, 15, 16, 17, 18, 19]);
  });

  it('keeps no more than the cap once the evicted ones are gone', () => {
    const aftermath = make(3);
    for (let x = 0; x < 20; x++) aftermath.add('wreck', { x, y: 0 }, SHAPE);
    aftermath.advance(300);
    expect(aftermath.active()).toHaveLength(3);
  });
});

describe('aftermathTimings', () => {
  it('burns wrecks for 3 s, then fades them over 5 s; craters fade over 10 s; infantry over 3 s', () => {
    const t = aftermathTimings({ anim: true, reducedMotion: false });
    expect(t.wreck).toEqual({ holdMs: 3000, fadeMs: 5000, burns: true });
    expect(t.crashMark).toEqual({ holdMs: 3000, fadeMs: 5000, burns: true });
    expect(t.crater).toEqual({ holdMs: 0, fadeMs: 10000, burns: false });
    expect(t.fallen).toEqual({ holdMs: 0, fadeMs: 3000, burns: false, fallMs: 250 });
  });

  it('with reduced motion: no fire, no fall, and faster fades', () => {
    const t = aftermathTimings({ anim: true, reducedMotion: true });
    expect(t.wreck).toEqual({ holdMs: 0, fadeMs: 2500, burns: false });
    expect(t.crater.fadeMs).toBe(5000);
    expect(t.fallen).toEqual({ holdMs: 0, fadeMs: 1500, burns: false, fallMs: 0 });
  });

  it('with ?anim=0: nothing lasts at all', () => {
    const t = aftermathTimings({ anim: false, reducedMotion: false });
    for (const kind of ['wreck', 'crashMark', 'crater', 'fallen'] as const)
      expect(t[kind].holdMs + t[kind].fadeMs).toBe(0);
  });
});

describe('AFTERMATH_OF', () => {
  it('vehicles leave wrecks, aircraft crash marks, infantry fall', () => {
    for (const [kind, { decal }] of Object.entries(AFTERMATH_OF)) {
      const { layer } = ENEMY_STATS[kind as keyof typeof ENEMY_STATS];
      const expected = kind === 'infantry' ? 'fallen' : layer === 'air' ? 'crashMark' : 'wreck';
      expect(decal, kind).toBe(expected);
    }
  });
});

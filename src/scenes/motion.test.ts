import { describe, expect, it } from 'vitest';
import { EFFECT, FLOATING_TEXT, REDUCED_MOTION, SHELL, TRACER } from '../data/display';
import { motionTimings, readLive } from './motion';

describe('motionTimings', () => {
  it('uses the full timings with motion on', () => {
    expect(motionTimings({ reducedMotion: false, anim: true })).toEqual({
      effectLifeMs: EFFECT.lifeMs,
      tracerFadeMs: TRACER.fadeMs,
      blastFadeMs: SHELL.blastFadeMs,
      floatingText: { durationMs: FLOATING_TEXT.durationMs, risePx: FLOATING_TEXT.risePx },
      enemyWalk: true,
    });
  });

  it('with reduced motion, keeps flashes, tracers and blasts but shorter, and stills the text drift and walk cycle', () => {
    const reduced = motionTimings({ reducedMotion: true, anim: true });
    expect(reduced).toEqual({
      effectLifeMs: REDUCED_MOTION.effectLifeMs,
      tracerFadeMs: REDUCED_MOTION.tracerFadeMs,
      blastFadeMs: REDUCED_MOTION.blastFadeMs,
      floatingText: { durationMs: FLOATING_TEXT.durationMs, risePx: 0 },
      enemyWalk: false,
    });
    expect(reduced.effectLifeMs).toBeGreaterThan(0);
    expect(reduced.effectLifeMs).toBeLessThan(EFFECT.lifeMs);
    expect(reduced.tracerFadeMs).toBeGreaterThan(0);
    expect(reduced.tracerFadeMs).toBeLessThan(TRACER.fadeMs);
    expect(reduced.blastFadeMs).toBeGreaterThan(0);
    expect(reduced.blastFadeMs).toBeLessThan(SHELL.blastFadeMs);
  });

  it.each([false, true])('turns every cosmetic off with ?anim=0 (reducedMotion %s)', (reducedMotion) => {
    expect(motionTimings({ reducedMotion, anim: false })).toEqual({
      effectLifeMs: 0,
      tracerFadeMs: 0,
      blastFadeMs: 0,
      floatingText: { durationMs: 0, risePx: 0 },
      enemyWalk: false,
    });
  });
});

describe('readLive', () => {
  it('reads a plain value or calls a getter', () => {
    expect(readLive(5)).toBe(5);
    expect(readLive(() => 7)).toBe(7);
  });
});

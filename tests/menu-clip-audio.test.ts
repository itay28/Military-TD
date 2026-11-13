import { describe, expect, it } from 'vitest';
import { compressLoop, loopBed, lowPassLoop, mixLoop, normalize, rmsDb, wavFile } from '../scripts/menu-clip-audio';

const RATE = 8000;
const tone = (hz: number, length: number, amp = 0.5) =>
  Float32Array.from({ length }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));

/** The energy of `buffer` at `hz` (one DFT bin), relative to a full-scale sine. */
const energyAt = (buffer: Float32Array, hz: number) => {
  let re = 0;
  let im = 0;
  buffer.forEach((x, i) => {
    re += x * Math.cos((2 * Math.PI * hz * i) / RATE);
    im += x * Math.sin((2 * Math.PI * hz * i) / RATE);
  });
  return (2 * Math.hypot(re, im)) / buffer.length;
};

describe('mixLoop', () => {
  it('is exactly the loop long, and a sound ringing past the end wraps into the start', () => {
    const out = mixLoop(10, [{ samples: Float32Array.of(1, 1, 1, 1), at: 8, gain: 0.5 }]);
    expect(out.length).toBe(10);
    expect([...out]).toEqual([0.5, 0.5, 0, 0, 0, 0, 0, 0, 0.5, 0.5]);
  });

  it('adds overlapping sounds', () => {
    const one = Float32Array.of(1);
    expect([
      ...mixLoop(3, [
        { samples: one, at: 1, gain: 1 },
        { samples: one, at: 1, gain: 2 },
      ]),
    ]).toEqual([0, 3, 0]);
  });
});

describe('loopBed', () => {
  it('crossfades the bed after the loop into its start, so the end runs into the start with no jump', () => {
    const bed = Float32Array.from({ length: 120 }, (_, i) => i / 120); // a ramp: cut plainly, it jumps at the seam
    const loop = loopBed(bed, 100, 20);
    expect(loop.length).toBe(100);
    expect(Math.abs(loop[0]! - loop[99]!)).toBeLessThan(0.05);
    expect(() => loopBed(bed, 110, 20)).toThrow(RangeError);
  });
});

describe('lowPassLoop', () => {
  it('keeps the low rumble and cuts what is above the cutoff', () => {
    const length = RATE;
    const high = tone(2500, length);
    const mixed = tone(100, length).map((x, i) => x + high[i]!);
    const muffled = lowPassLoop(mixed, RATE, 800);
    expect(energyAt(muffled, 100)).toBeGreaterThan(0.45);
    expect(energyAt(muffled, 2500)).toBeLessThan(0.01);
  });

  it('starts in the state it ends in: a steady tone has no jump at the loop point', () => {
    const muffled = lowPassLoop(tone(100, RATE), RATE, 800); // a whole number of cycles, so the input loops
    const step = Math.abs(muffled[0]! - muffled[RATE - 1]!);
    const typical = Math.abs(muffled[1]! - muffled[0]!);
    expect(step).toBeLessThan(typical * 2 + 1e-6);
  });
});

describe('compressLoop', () => {
  it('turns a sharp hit down more than the quiet bed around it', () => {
    const input = tone(100, RATE, 0.05);
    for (let i = 4000; i < 4400; i++) input[i] = input[i]! * 18;
    const out = compressLoop(input, RATE, { thresholdDb: -20, ratio: 4, attackMs: 5, releaseMs: 200 });
    const hitBefore = rmsDb(input, 4100, 4400) - rmsDb(input, 1000, 3000);
    const hitAfter = rmsDb(out, 4100, 4400) - rmsDb(out, 1000, 3000);
    expect(hitAfter).toBeLessThan(hitBefore - 6);
  });
});

describe('normalize and rmsDb', () => {
  it('puts the peak at the level asked for', () => {
    const out = normalize(Float32Array.of(0.1, -0.4, 0.2), -6);
    expect(Math.max(...[...out].map(Math.abs))).toBeCloseTo(10 ** (-6 / 20), 6);
    expect([...normalize(new Float32Array(3), -6)]).toEqual([0, 0, 0]);
  });

  it('reads round the loop', () => {
    expect(rmsDb(Float32Array.of(1, 0, 0, 1), 3, 5)).toBeCloseTo(0, 6);
  });
});

describe('wavFile', () => {
  it('is a mono float WAV of the samples', () => {
    const wav = wavFile(Float32Array.of(0, 0.5), 48_000);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt16LE(20)).toBe(3);
    expect(wav.readUInt32LE(24)).toBe(48_000);
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.readFloatLE(48)).toBe(0.5);
  });
});

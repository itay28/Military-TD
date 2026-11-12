/**
 * The menu clip's muffled battle track (#568): pure sample maths, run by the capture (`npm run menu:clip`,
 * tests/menu-clip/capture.spec.ts). Every step treats the buffer as a loop, so its end flows into its start: a sound
 * ringing past the end wraps round, and the filters run round it twice so they start in the state they end in.
 */

/** One sound placed in the loop: its samples, the sample it starts on, and its gain. */
export interface Placement {
  readonly samples: Float32Array;
  readonly at: number;
  readonly gain: number;
}

/** The sounds mixed into a loop `length` samples long; anything past the end wraps round to the start. */
export function mixLoop(length: number, placements: readonly Placement[]): Float32Array {
  const out = new Float32Array(length);
  for (const { samples, at, gain } of placements)
    for (let i = 0; i < samples.length; i++) out[(at + i) % length]! += samples[i]! * gain;
  return out;
}

/**
 * `bed` made into a loop `length` samples long: its first `length` samples, with the `fade` after them crossfaded
 * (equal power) into the start, so the end runs into the start with no seam. Needs `length + fade` samples of bed.
 */
export function loopBed(bed: Float32Array, length: number, fade: number): Float32Array {
  if (bed.length < length + fade) throw new RangeError(`loopBed: needs ${length + fade} samples, got ${bed.length}`);
  const out = bed.slice(0, length);
  for (let i = 0; i < fade; i++) {
    const t = (i + 0.5) / fade;
    out[i] = bed[i]! * Math.sin((Math.PI / 2) * t) + bed[length + i]! * Math.cos((Math.PI / 2) * t);
  }
  return out;
}

/** The second of two passes round the loop of `step`, so the state it starts in is the state the loop ends in. */
function circular(buffer: Float32Array, step: (x: number) => number): Float32Array {
  for (const x of buffer) step(x);
  return buffer.map(step);
}

/** A 2-pole low-pass (RBJ biquad, Butterworth Q) at `cutoffHz`, run round the loop. */
function biquadLowPass(buffer: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const w = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0;
  const b1 = (1 - cos) / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return circular(buffer, (x) => {
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  });
}

/** A 4-pole low-pass (two biquads, 24 dB an octave) at `cutoffHz`: a wall muffling the battle outside. */
export function lowPassLoop(buffer: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  return biquadLowPass(biquadLowPass(buffer, sampleRate, cutoffHz), sampleRate, cutoffHz);
}

export interface Compression {
  /** Level (dBFS) above which it turns the gain down. */
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly attackMs: number;
  readonly releaseMs: number;
}

/** Smooths the sharp hits: a peak compressor, its envelope run round the loop. */
export function compressLoop(
  buffer: Float32Array,
  sampleRate: number,
  { thresholdDb, ratio, attackMs, releaseMs }: Compression,
): Float32Array {
  const attack = Math.exp(-1 / ((attackMs / 1000) * sampleRate));
  const release = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
  const threshold = 10 ** (thresholdDb / 20);
  let envelope = 0;
  const gains = circular(buffer, (x) => {
    const level = Math.abs(x);
    const k = level > envelope ? attack : release;
    envelope = k * envelope + (1 - k) * level;
    return envelope <= threshold ? 1 : (threshold * (envelope / threshold) ** (1 / ratio)) / envelope;
  });
  return buffer.map((x, i) => x * gains[i]!);
}

/** `buffer` scaled so its loudest sample is at `peakDb` dBFS (silence stays silent). */
export function normalize(buffer: Float32Array, peakDb: number): Float32Array {
  const peak = buffer.reduce((most, x) => Math.max(most, Math.abs(x)), 0);
  if (peak === 0) return buffer.slice();
  const gain = 10 ** (peakDb / 20) / peak;
  return buffer.map((x) => x * gain);
}

/** The RMS level, in dBFS, of `buffer[from, to)`, reading round the loop. */
export function rmsDb(buffer: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    const x = buffer[((i % buffer.length) + buffer.length) % buffer.length]!;
    sum += x * x;
  }
  return 10 * Math.log10(sum / (to - from) + 1e-20);
}

/** A mono 32-bit float WAV of `samples`. */
export function wavFile(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); // IEEE float
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

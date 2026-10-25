/** A seeded random source: the only randomness the sim may use (ADR-0003). */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** A whole number from `min` to `max`, both included. Throws RangeError unless both are whole and min ≤ max. */
  int(min: number, max: number): number;
}

/** Mulberry32: small, fast, and the same sequence for the same seed on every machine. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min)
        throw new RangeError(`int(${min}, ${max}): bounds must be whole numbers with min ≤ max`);
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}

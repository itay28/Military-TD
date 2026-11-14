import { waveRoadTimeMs, type WaveData, type WaveGroup } from '../sim/waves';
import type { EnemyKind } from './enemies';

const group = (kind: EnemyKind, count: number, spacingMs: number, delayMs = 0): WaveGroup => ({
  kind,
  count,
  spacingMs,
  delayMs,
});

/** A wave's timer when its data gives none (`WaveData.afterMs`, ADR-0011): from the previous wave's start, in game time. */
export const DEFAULT_WAVE_AFTER_MS = 30_000;

/** The first wave's timer on every map: the build window, from the game's start. */
export const BUILD_WINDOW_MS = 40_000;

/**
 * How each later wave's timer follows the road (#570): `roadShare` of the time the wave before takes to pass along the
 * map's road (`waveRoadTimeMs`), plus `extraMs`, rounded to the second and kept within `minMs`..`maxMs`. So a short
 * road or a quick wave of Jeeps brings the next one sooner, and slow armour on a long road gives more time. Set with
 * the balance bots (`tests/maps/maps.test.ts`). The 60 s ceiling lets the long late waves of a 20-wave map (#381) fill
 * about 15–20 minutes.
 */
export const WAVE_TIMER = { roadShare: 0.5, extraMs: 10_000, minMs: 15_000, maxMs: 60_000 } as const;

/** `waves` with their wave timers for a road `roadTiles` long (#570). A wave that sets its own `afterMs` keeps it. */
export function timedWaves(waves: readonly WaveData[], roadTiles: number): WaveData[] {
  const { roadShare, extraMs, minMs, maxMs } = WAVE_TIMER;
  return waves.map((wave, i) => {
    if (wave.afterMs !== undefined) return wave;
    if (i === 0) return { ...wave, afterMs: BUILD_WINDOW_MS };
    const raw = roadShare * waveRoadTimeMs(waves[i - 1]!, roadTiles) + extraMs;
    return { ...wave, afterMs: Math.min(maxMs, Math.max(minMs, Math.round(raw / 1000) * 1000)) };
  });
}

/**
 * The wave schedule, in order (PLAN: starting numbers). Each new kind first comes alone and in small numbers, then
 * mixes with the others. In a mixed wave, later groups start after a delay so the kinds overlap without all
 * arriving at once. Waves 1–10 teach; waves 11–20 (#381) build up to the finale, each of 11–19 ending in a second
 * push of Tanks 50 s in, as on every map, so the late waves run long and their timers reach the ceiling.
 */
export const WAVES: readonly WaveData[] = [
  { groups: [group('infantry', 8, 800)] },
  { groups: [group('infantry', 12, 800)] },
  { groups: [group('jeep', 3, 1500)] },
  { groups: [group('infantry', 10, 800), group('jeep', 5, 600, 4000)] },
  { groups: [group('tank', 1, 0)] },
  { groups: [group('infantry', 12, 800), group('tank', 2, 3000, 3000)] },
  { groups: [group('helicopter', 3, 2500)] },
  { groups: [group('helicopter', 6, 2000), group('infantry', 10, 800, 2000), group('jeep', 6, 600, 8000)] },
  { groups: [group('tank', 3, 3000), group('helicopter', 6, 2000, 3000), group('jeep', 10, 600, 6000)] },
  {
    groups: [
      group('tank', 5, 3000),
      group('helicopter', 10, 2000, 2000),
      group('infantry', 20, 600, 4000),
      group('jeep', 10, 600, 12000),
    ],
  },
  {
    groups: [
      group('infantry', 24, 600),
      group('jeep', 12, 500, 6000),
      group('helicopter', 6, 2000, 10000),
      group('tank', 2, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 5, 3000),
      group('infantry', 20, 600, 4000),
      group('tank', 2, 3000, 20000),
      group('tank', 2, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 10, 1800),
      group('jeep', 14, 500, 4000),
      group('helicopter', 4, 2000, 24000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('infantry', 30, 500),
      group('tank', 6, 2800, 3000),
      group('jeep', 12, 500, 15000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 6, 2500),
      group('helicopter', 10, 1800, 3000),
      group('infantry', 24, 500, 6000),
      group('jeep', 12, 500, 14000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 14, 1600),
      group('infantry', 30, 450, 2000),
      group('tank', 4, 3000, 10000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 8, 2400),
      group('jeep', 18, 450, 4000),
      group('helicopter', 10, 1700, 8000),
      group('infantry', 20, 500, 16000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('infantry', 36, 400),
      group('helicopter', 12, 1600, 4000),
      group('tank', 7, 2500, 8000),
      group('jeep', 16, 400, 18000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 9, 2300),
      group('helicopter', 14, 1500, 2000),
      group('infantry', 30, 400, 5000),
      group('jeep', 18, 400, 12000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 10, 2200),
      group('helicopter', 16, 1500, 2000),
      group('infantry', 40, 400, 4000),
      group('jeep', 20, 400, 10000),
      group('tank', 4, 2500, 30000),
    ],
  },
];

/**
 * Switchback's schedule: a step harder than `WAVES`. Larger groups, and the kinds mix from wave 3; every wave still
 * answerable more than one way (ADR-0007). The APC and the Fighter jet join waves 11–20 (#366, #381): 2 APCs trail
 * wave 11 and 3 jets trail wave 13, each the last group so it arrives on its own; the later waves mix them in.
 */
export const SWITCHBACK_WAVES: readonly WaveData[] = [
  { groups: [group('infantry', 10, 800)] },
  { groups: [group('infantry', 10, 700), group('jeep', 3, 1500, 4000)] },
  { groups: [group('jeep', 6, 1000), group('infantry', 10, 700, 3000)] },
  { groups: [group('tank', 2, 3000), group('infantry', 12, 700, 2000)] },
  { groups: [group('helicopter', 4, 2500), group('jeep', 6, 800, 4000)] },
  { groups: [group('infantry', 16, 600), group('tank', 3, 3000, 3000)] },
  { groups: [group('helicopter', 6, 2000), group('infantry', 12, 700, 2000), group('jeep', 6, 800, 8000)] },
  { groups: [group('tank', 3, 3000), group('jeep', 10, 600, 3000), group('helicopter', 4, 2000, 6000)] },
  {
    groups: [
      group('helicopter', 8, 1800),
      group('infantry', 16, 600, 2000),
      group('jeep', 8, 600, 8000),
      group('tank', 2, 3000, 12000),
    ],
  },
  {
    groups: [
      group('tank', 4, 2500),
      group('helicopter', 8, 2000, 3000),
      group('infantry', 16, 600, 5000),
      group('jeep', 12, 600, 6000),
    ],
  },
  {
    groups: [
      group('infantry', 20, 600),
      group('tank', 3, 3000, 3000),
      group('apc', 2, 3000, 12000),
      group('tank', 2, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 10, 1800),
      group('jeep', 12, 500, 3000),
      group('infantry', 16, 600, 8000),
      group('tank', 2, 3000, 20000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 4, 2800),
      group('infantry', 20, 500, 2000),
      group('helicopter', 6, 2000, 10000),
      group('jet', 3, 1200, 24000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('apc', 3, 2800),
      group('helicopter', 10, 1800, 2000),
      group('jeep', 14, 500, 6000),
      group('infantry', 20, 500, 12000),
      group('tank', 3, 3000, 24000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 5, 2600),
      group('jet', 4, 1100, 4000),
      group('infantry', 24, 500, 6000),
      group('helicopter', 8, 1800, 12000),
      group('jeep', 12, 500, 30000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 12, 1700),
      group('apc', 4, 2600, 3000),
      group('jeep', 16, 450, 8000),
      group('jet', 4, 1000, 16000),
      group('tank', 3, 3000, 30000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 6, 2500),
      group('infantry', 28, 450, 2000),
      group('helicopter', 10, 1700, 6000),
      group('apc', 3, 2600, 14000),
      group('jeep', 14, 450, 34000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('infantry', 30, 450),
      group('jet', 6, 1000, 3000),
      group('tank', 6, 2500, 6000),
      group('jeep', 16, 450, 14000),
      group('helicopter', 8, 1800, 30000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 7, 2400),
      group('helicopter', 14, 1600, 2000),
      group('apc', 5, 2500, 4000),
      group('infantry', 28, 450, 8000),
      group('jet', 5, 1000, 16000),
      group('tank', 3, 3000, 36000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 8, 2300),
      group('helicopter', 16, 1500, 2000),
      group('apc', 5, 2400, 4000),
      group('infantry', 32, 400, 6000),
      group('jet', 6, 900, 10000),
      group('jeep', 18, 400, 14000),
      group('tank', 4, 2600, 40000),
    ],
  },
];

/**
 * Serpentine's schedule: a step harder than Switchback's. Its long Path gives towers more time, so the waves are
 * bigger and denser, with more armour and air, mixed (ADR-0007). The APC and the jet come in as on Switchback (waves
 * 11 and 13, then mixed in), in larger numbers.
 */
export const SERPENTINE_WAVES: readonly WaveData[] = [
  { groups: [group('infantry', 12, 700)] },
  { groups: [group('infantry', 12, 650), group('jeep', 4, 1350, 4000)] },
  { groups: [group('jeep', 7, 900), group('infantry', 12, 650, 3000)] },
  { groups: [group('tank', 2, 2700), group('infantry', 14, 650, 2000)] },
  { groups: [group('helicopter', 5, 2250), group('jeep', 7, 700, 4000)] },
  { groups: [group('infantry', 19, 550), group('tank', 4, 2700, 3000)] },
  { groups: [group('helicopter', 7, 1800), group('infantry', 14, 650, 2000), group('jeep', 7, 700, 8000)] },
  { groups: [group('tank', 4, 2700), group('jeep', 12, 550, 3000), group('helicopter', 5, 1800, 6000)] },
  {
    groups: [
      group('helicopter', 10, 1600),
      group('infantry', 19, 550, 2000),
      group('jeep', 10, 550, 8000),
      group('tank', 2, 2700, 12000),
    ],
  },
  {
    groups: [
      group('tank', 5, 2250),
      group('helicopter', 10, 1800, 3000),
      group('infantry', 19, 550, 5000),
      group('jeep', 14, 550, 6000),
    ],
  },
  {
    groups: [
      group('infantry', 24, 550),
      group('tank', 4, 2700, 3000),
      group('apc', 2, 2700, 12000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 12, 1600),
      group('jeep', 14, 450, 3000),
      group('infantry', 19, 550, 8000),
      group('tank', 2, 2700, 20000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 5, 2500),
      group('infantry', 24, 450, 2000),
      group('helicopter', 7, 1800, 10000),
      group('jet', 3, 1100, 24000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('apc', 4, 2500),
      group('helicopter', 12, 1600, 2000),
      group('jeep', 17, 450, 6000),
      group('infantry', 24, 450, 12000),
      group('tank', 4, 2700, 24000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 6, 2350),
      group('jet', 5, 1000, 4000),
      group('infantry', 29, 450, 6000),
      group('helicopter', 10, 1600, 12000),
      group('jeep', 14, 450, 30000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 14, 1550),
      group('apc', 5, 2350, 3000),
      group('jeep', 19, 400, 8000),
      group('jet', 5, 900, 16000),
      group('tank', 4, 2700, 30000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 7, 2250),
      group('infantry', 34, 400, 2000),
      group('helicopter', 12, 1550, 6000),
      group('apc', 4, 2350, 14000),
      group('jeep', 17, 400, 34000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('infantry', 36, 400),
      group('jet', 7, 900, 3000),
      group('tank', 7, 2250, 6000),
      group('jeep', 19, 400, 14000),
      group('helicopter', 10, 1600, 30000),
      group('tank', 6, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 8, 2150),
      group('helicopter', 17, 1450, 2000),
      group('apc', 6, 2250, 4000),
      group('infantry', 34, 400, 8000),
      group('jet', 6, 900, 16000),
      group('tank', 4, 2700, 36000),
      group('tank', 6, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 10, 2050),
      group('helicopter', 19, 1350, 2000),
      group('apc', 6, 2150, 4000),
      group('infantry', 38, 350, 6000),
      group('jet', 7, 800, 10000),
      group('jeep', 22, 350, 14000),
      group('tank', 5, 2350, 40000),
    ],
  },
];

/**
 * Hairpin's schedule, the hardest: its towers cover the Path twice, so it brings the most armour and air and the
 * tightest spacing (ADR-0007). The APC and the jet come in as on Serpentine (waves 11 and 13, then mixed in), and one
 * Heavy tank ends wave 20, the map's last (#366, #381): it starts after every other group, so the boss bar shows over
 * a thinning field.
 */
export const HAIRPIN_WAVES: readonly WaveData[] = [
  { groups: [group('infantry', 14, 600)] },
  { groups: [group('infantry', 14, 550), group('jeep', 4, 1250, 4000)] },
  { groups: [group('jeep', 8, 800), group('infantry', 14, 550, 3000)] },
  { groups: [group('tank', 3, 2450), group('infantry', 17, 550, 2000)] },
  { groups: [group('helicopter', 6, 2050), group('jeep', 8, 650, 4000)] },
  { groups: [group('infantry', 22, 500), group('tank', 4, 2450, 3000)] },
  { groups: [group('helicopter', 8, 1650), group('infantry', 17, 550, 2000), group('jeep', 8, 650, 8000)] },
  { groups: [group('tank', 4, 2450), group('jeep', 14, 500, 3000), group('helicopter', 6, 1650, 6000)] },
  {
    groups: [
      group('helicopter', 11, 1500),
      group('infantry', 22, 500, 2000),
      group('jeep', 11, 500, 8000),
      group('tank', 3, 2450, 12000),
    ],
  },
  {
    groups: [
      group('tank', 6, 2050),
      group('helicopter', 11, 1650, 3000),
      group('infantry', 22, 500, 5000),
      group('jeep', 17, 500, 6000),
    ],
  },
  {
    groups: [
      group('infantry', 28, 500),
      group('tank', 4, 2450, 3000),
      group('apc', 2, 2450, 12000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 14, 1500),
      group('jeep', 17, 400, 3000),
      group('infantry', 22, 500, 8000),
      group('tank', 3, 2450, 20000),
      group('tank', 3, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 6, 2300),
      group('infantry', 28, 400, 2000),
      group('helicopter', 8, 1650, 10000),
      group('jet', 3, 1000, 24000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('apc', 4, 2300),
      group('helicopter', 14, 1500, 2000),
      group('jeep', 20, 400, 6000),
      group('infantry', 28, 400, 12000),
      group('tank', 4, 2450, 24000),
      group('tank', 4, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 7, 2150),
      group('jet', 6, 900, 4000),
      group('infantry', 34, 400, 6000),
      group('helicopter', 11, 1500, 12000),
      group('jeep', 17, 400, 30000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('helicopter', 17, 1400),
      group('apc', 6, 2150, 3000),
      group('jeep', 22, 350, 8000),
      group('jet', 6, 800, 16000),
      group('tank', 4, 2450, 30000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 8, 2050),
      group('infantry', 39, 350, 2000),
      group('helicopter', 14, 1400, 6000),
      group('apc', 4, 2150, 14000),
      group('jeep', 20, 350, 34000),
      group('tank', 5, 3000, 50000),
    ],
  },
  {
    groups: [
      group('infantry', 42, 350),
      group('jet', 8, 800, 3000),
      group('tank', 8, 2050, 6000),
      group('jeep', 22, 350, 14000),
      group('helicopter', 11, 1500, 30000),
      group('tank', 6, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 10, 1950),
      group('helicopter', 20, 1300, 2000),
      group('apc', 7, 2050, 4000),
      group('infantry', 39, 350, 8000),
      group('jet', 7, 800, 16000),
      group('tank', 4, 2450, 36000),
      group('tank', 6, 3000, 50000),
    ],
  },
  {
    groups: [
      group('tank', 11, 1900),
      group('helicopter', 22, 1250, 2000),
      group('apc', 7, 1950, 4000),
      group('infantry', 45, 350, 6000),
      group('jet', 8, 750, 10000),
      group('jeep', 25, 350, 14000),
      group('tank', 6, 2150, 40000),
      group('heavyTank', 1, 0, 48000),
    ],
  },
];

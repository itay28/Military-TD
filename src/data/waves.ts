import type { WaveData, WaveGroup } from '../sim/waves';
import type { EnemyKind } from './enemies';

const group = (kind: EnemyKind, count: number, spacingMs: number, delayMs = 0): WaveGroup => ({
  kind,
  count,
  spacingMs,
  delayMs,
});

/**
 * With auto-start on, the next wave starts this long after the last one is cleared, in game time. Longer than
 * `WAVE_BANNER_MS`, so the "Wave N cleared" banner and a moment of build time aren't skipped.
 */
export const AUTO_START_DELAY_MS = 5000;

/**
 * The wave schedule, in order (PLAN: starting numbers). Each new kind first comes alone and in small numbers, then
 * mixes with the others. In a mixed wave, later groups start after a delay so the kinds overlap without all
 * arriving at once.
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
];

/**
 * Switchback's schedule: a step harder than `WAVES`. Two more waves, larger groups, and the kinds mix from wave 3,
 * but no new kind, and every wave still answerable more than one way (ADR-0007).
 */
export const SWITCHBACK_WAVES: readonly WaveData[] = [
  { groups: [group('infantry', 10, 800)] },
  { groups: [group('infantry', 10, 700), group('jeep', 3, 1500, 4000)] },
  { groups: [group('jeep', 6, 1000), group('infantry', 10, 700, 3000)] },
  { groups: [group('tank', 2, 3000), group('infantry', 12, 700, 2000)] },
  { groups: [group('helicopter', 4, 2500), group('jeep', 6, 800, 4000)] },
  { groups: [group('infantry', 16, 600), group('tank', 3, 3000, 3000)] },
  { groups: [group('helicopter', 6, 2000), group('infantry', 12, 700, 2000)] },
  { groups: [group('tank', 3, 3000), group('jeep', 10, 600, 3000), group('helicopter', 4, 2000, 6000)] },
  { groups: [group('helicopter', 8, 1800), group('infantry', 16, 600, 2000), group('jeep', 8, 600, 8000)] },
  { groups: [group('tank', 4, 2500), group('helicopter', 8, 2000, 3000), group('jeep', 12, 600, 6000)] },
  {
    groups: [
      group('infantry', 24, 500),
      group('tank', 4, 3000, 3000),
      group('helicopter', 8, 2000, 6000),
      group('jeep', 10, 600, 10000),
    ],
  },
  {
    groups: [
      group('tank', 6, 2500),
      group('helicopter', 12, 1800, 2000),
      group('infantry', 24, 500, 4000),
      group('jeep', 12, 600, 12000),
    ],
  },
];

/**
 * Serpentine's schedule: a step harder than Switchback's. Its long Path gives towers more time, so the waves are
 * bigger and denser, with more armour and air, but still only the four kinds, mixed (ADR-0007).
 */
export const SERPENTINE_WAVES: readonly WaveData[] = [
  { groups: [group('infantry', 12, 700)] },
  { groups: [group('infantry', 12, 600), group('jeep', 4, 1200, 3000)] },
  { groups: [group('jeep', 8, 900), group('infantry', 12, 600, 3000)] },
  { groups: [group('tank', 3, 3000), group('infantry', 14, 600, 2000)] },
  { groups: [group('helicopter', 5, 2200), group('jeep', 8, 700, 4000)] },
  { groups: [group('infantry', 18, 500), group('tank', 4, 2800, 3000)] },
  { groups: [group('helicopter', 7, 1800), group('infantry', 14, 600, 2000)] },
  { groups: [group('tank', 4, 2800), group('jeep', 12, 500, 3000), group('helicopter', 5, 2000, 6000)] },
  { groups: [group('helicopter', 9, 1700), group('infantry', 18, 500, 2000), group('jeep', 10, 500, 8000)] },
  { groups: [group('tank', 5, 2500), group('helicopter', 9, 1800, 3000), group('jeep', 14, 500, 6000)] },
  {
    groups: [
      group('infantry', 26, 450),
      group('tank', 5, 2800, 3000),
      group('helicopter', 9, 1800, 6000),
      group('jeep', 12, 500, 10000),
    ],
  },
  {
    groups: [
      group('tank', 7, 2400),
      group('helicopter', 13, 1700, 2000),
      group('infantry', 26, 450, 4000),
      group('jeep', 14, 500, 12000),
    ],
  },
];

/**
 * Hairpin's schedule, the hardest: its towers cover the Path twice, so it brings one more wave, the most armour and
 * air, and the tightest spacing, from the same four kinds (ADR-0007).
 */
export const HAIRPIN_WAVES: readonly WaveData[] = [
  { groups: [group('infantry', 14, 600)] },
  { groups: [group('infantry', 14, 550), group('jeep', 5, 1000, 3000)] },
  { groups: [group('jeep', 10, 800), group('infantry', 14, 550, 3000)] },
  { groups: [group('tank', 3, 2800), group('infantry', 16, 550, 2000)] },
  { groups: [group('helicopter', 6, 2000), group('jeep', 10, 600, 4000)] },
  { groups: [group('infantry', 20, 450), group('tank', 4, 2600, 3000)] },
  { groups: [group('helicopter', 8, 1700), group('infantry', 16, 550, 2000)] },
  { groups: [group('tank', 5, 2600), group('jeep', 14, 450, 3000), group('helicopter', 6, 1900, 6000)] },
  { groups: [group('helicopter', 10, 1600), group('infantry', 20, 450, 2000), group('jeep', 12, 450, 8000)] },
  { groups: [group('tank', 6, 2400), group('helicopter', 10, 1700, 3000), group('jeep', 16, 450, 6000)] },
  {
    groups: [
      group('infantry', 28, 400),
      group('tank', 6, 2600, 3000),
      group('helicopter', 10, 1700, 6000),
      group('jeep', 14, 450, 10000),
    ],
  },
  {
    groups: [
      group('tank', 7, 2300),
      group('helicopter', 14, 1600, 2000),
      group('infantry', 28, 400, 4000),
      group('jeep', 16, 450, 12000),
    ],
  },
  {
    groups: [
      group('helicopter', 14, 1500),
      group('tank', 8, 2200, 2000),
      group('infantry', 30, 400, 5000),
      group('jeep', 18, 400, 10000),
    ],
  },
];

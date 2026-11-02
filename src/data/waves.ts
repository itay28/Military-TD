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

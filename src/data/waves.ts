import type { WaveData, WaveGroup } from '../sim/waves';
import type { EnemyKind } from './enemies';

const group = (kind: EnemyKind, count: number, spacingMs: number, delayMs = 0): WaveGroup => ({
  kind,
  count,
  spacingMs,
  delayMs,
});

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

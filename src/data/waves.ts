import type { WaveData } from '../sim/waves';

/** The wave schedule, in order (PLAN: starting numbers). The MVP has one wave. */
export const MVP_WAVES: readonly WaveData[] = [
  { groups: [{ kind: 'infantry', count: 8, spacingMs: 800, delayMs: 0 }] },
];

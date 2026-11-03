import type { EnemyKind } from './enemies';

/** Each enemy group spawns over this long, so the 200 bunch up along the Path. */
const SPAWN_MS = 1000;

/**
 * The Heavy load's numbers: a seeded, worst-case-sized game for the performance checks (#73, docs/performance.md).
 * `src/sim/heavyLoad.ts` builds it; the sim budget test, the browser frame-time report and the `heavy-load` scenario
 * all use that.
 */
export const HEAVY_LOAD = {
  seed: 73,
  enemies: 200,
  towers: 40,
  /** By kind, adding up to `enemies`: mostly armour, so the towers can't thin them out much while ticks are timed. */
  mix: [
    ['infantry', 50],
    ['jeep', 30],
    ['tank', 70],
    ['helicopter', 50],
  ] as const satisfies readonly (readonly [EnemyKind, number])[],
  spawnMs: SPAWN_MS,
  /** More than every enemy leaking would cost, so a Heavy load never ends in Defeat. */
  lives: 1000,
  /** Towers stand at most this many tiles (in both directions) from a Path tile, so they all see action. */
  nearPath: 2,
  /** Game time after the wave starts until every enemy has spawned (plus a tick: `src/sim/heavyLoad.ts`). */
  warmupMs: SPAWN_MS,
  /** Game time the sim budget test times. */
  measureMs: 5000,
} as const;

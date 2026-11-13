import { HEAVY_LOAD } from '../data/heavyLoad';
import { TICK_MS } from './game';

// Kept apart from `heavyLoad.ts`, which imports the maps (`?raw`, Vite only): the browser frame-time spec loads this
// under Playwright's own loader and must not reach them (#581, tests/browserSpecImports.test.ts).

/** Ticks after the wave starts until every enemy has spawned. */
export const HEAVY_LOAD_WARMUP_TICKS = Math.ceil(HEAVY_LOAD.warmupMs / TICK_MS) + 1;

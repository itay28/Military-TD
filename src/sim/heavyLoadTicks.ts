import { HEAVY_LOAD } from '../data/heavyLoad';
import { TICK_MS } from './game';

// Kept apart from `heavyLoad.ts`, which reaches the .tmj maps (`?raw`): Playwright specs import this and can't load those (#580).

/** Ticks after the wave starts until every enemy has spawned. */
export const HEAVY_LOAD_WARMUP_TICKS = Math.ceil(HEAVY_LOAD.warmupMs / TICK_MS) + 1;

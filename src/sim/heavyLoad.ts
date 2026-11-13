import { HEAVY_LOAD } from '../data/heavyLoad';
import { SERPENTINE_MAP } from '../data/maps';
import type { TowerKind } from '../data/towers';
import { TICK_MS, type Game } from './game';
import { HEAVY_LOAD_WARMUP_TICKS } from './heavyLoadTicks';
import { createMap, type Tile } from './map';
import { createRng } from './rng';
import { setUpGame, type GameSetup, type TowerPlacement } from './scenario';
import type { WaveGroup } from './waves';

/** Cycled through, so every kind is in the Heavy load. */
const TOWER_KINDS: readonly TowerKind[] = ['rifleNest', 'aaGun', 'cannon', 'mortar'];

/**
 * The Heavy load's setup (numbers in `src/data/heavyLoad.ts`): the longest Path (every map is 16 × 10, so Serpentine is the largest to cover), `towers`
 * of every kind on seeded tiles near the Path, and one wave of `enemies` of every kind. Same seed, same setup.
 */
export function heavyLoadSetup(seed: number = HEAVY_LOAD.seed): GameSetup {
  const map = createMap(SERPENTINE_MAP);
  const near: Tile[] = [];
  for (let row = 0; row < map.rows; row++)
    for (let col = 0; col < map.cols; col++) {
      const tile = { col, row };
      if (!map.isBuildable(tile)) continue;
      const close = map.pathTiles.some(
        (p) => Math.max(Math.abs(p.col - col), Math.abs(p.row - row)) <= HEAVY_LOAD.nearPath,
      );
      if (close) near.push(tile);
    }
  if (near.length < HEAVY_LOAD.towers)
    throw new Error(`Heavy load: only ${near.length} buildable tiles near the Path, need ${HEAVY_LOAD.towers}`);
  // Fisher–Yates on the seeded Rng, then the first `towers` tiles.
  const rng = createRng(seed);
  for (let i = near.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [near[i], near[j]] = [near[j]!, near[i]!];
  }
  const towers: TowerPlacement[] = near
    .slice(0, HEAVY_LOAD.towers)
    .map((tile, i) => ({ kind: TOWER_KINDS[i % TOWER_KINDS.length]!, tile }));
  const groups: WaveGroup[] = HEAVY_LOAD.mix.map(([kind, count]) => ({
    kind,
    count,
    spacingMs: HEAVY_LOAD.spawnMs / count,
    delayMs: 0,
  }));
  return { map: SERPENTINE_MAP, lives: HEAVY_LOAD.lives, money: 0, towers, waves: [{ groups }] };
}

export { HEAVY_LOAD_WARMUP_TICKS };

/** A Heavy load game mid-wave: its setup, the wave started, and `HEAVY_LOAD_WARMUP_TICKS` run so every enemy has spawned. */
export function createHeavyLoadGame(seed: number = HEAVY_LOAD.seed): Game {
  const game = setUpGame(heavyLoadSetup(seed));
  const started = game.callNextWave();
  if (!started.ok) throw new Error(`Heavy load: the wave didn't start (${started.reason})`);
  for (let i = 0; i < HEAVY_LOAD_WARMUP_TICKS; i++) game.tick(TICK_MS);
  return game;
}

/** Ticks the sim budget test times. */
export const HEAVY_LOAD_MEASURE_TICKS = Math.round(HEAVY_LOAD.measureMs / TICK_MS);

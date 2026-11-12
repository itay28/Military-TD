import type { MenuClip } from '../data/menuClip';
import { TOWER_LEVELS } from '../data/towers';
import { TICK_MS, type Game } from './game';
import type { MapData, Position } from './map';
import { setUpGame } from './scenario';

/**
 * The Lives and Money the clip's game starts with: far more than it can lose, so it never ends in Defeat. Neither is
 * shown.
 */
export const CLIP_POOL = 1_000_000;

/** The whole ticks in `ms` of game time. */
export const clipTicks = (ms: number): number => Math.round(ms / TICK_MS);

const wholeTicks = (ms: number): boolean => Math.abs(ms / TICK_MS - clipTicks(ms)) < 1e-6 && clipTicks(ms) > 0;

/**
 * Throws a RangeError unless the clip repeats: the loop, spawn period, warm-up and frame are whole ticks, the period
 * divides the loop, the spawn cycle divides the spawns in a loop, and the warm-up is whole loops.
 */
export function validateMenuClip({ loopMs, spawnEveryMs, spawns, warmUpMs, fps }: MenuClip): void {
  const frameMs = 1000 / fps;
  if (![loopMs, spawnEveryMs, frameMs].every(wholeTicks))
    throw new RangeError('Menu clip: the loop, spawn period and frame must be whole ticks');
  const loopTicks = clipTicks(loopMs);
  const spawnTicks = clipTicks(spawnEveryMs);
  if (loopTicks % spawnTicks !== 0) throw new RangeError('Menu clip: the spawn period must divide the loop');
  if (spawns.length === 0 || (loopTicks / spawnTicks) % spawns.length !== 0)
    throw new RangeError('Menu clip: the spawn cycle must divide the spawns in a loop');
  if (warmUpMs < 0 || !Number.isInteger(warmUpMs / loopMs))
    throw new RangeError('Menu clip: the warm-up must be whole loops');
}

/** The clip's game: the real game under a script of spawns. Each `tick` must be `TICK_MS`. */
export interface MenuClipGame extends Game {
  /**
   * What the scene seeds enemy `id`'s walk cycle with: its place among a loop's spawns, the same every loop, where the
   * id itself grows (so the walk and the rotors would jump at the loop point). An id it didn't spawn comes back as is.
   */
  animKey(id: number): number;
}

/**
 * The real game, set up from the clip (#568): its towers placed free at their levels, no waves, Lives and Money from
 * `CLIP_POOL`, and an enemy at the Path start every `spawnEveryMs` from the first tick, round the spawn cycle. The ones
 * that don't die get `survivorHpScale` times their HP, so they drive or walk off the map; the others die where the
 * towers kill them. The sim has no randomness and each enemy walks on its own, so the field repeats every loop once
 * the first enemies have left. Throws for a clip that doesn't repeat (`validateMenuClip`), a tower that can't be placed
 * or a level its kind doesn't have.
 */
export function createMenuClipGame(clip: MenuClip, map: MapData): MenuClipGame {
  validateMenuClip(clip);
  const game = setUpGame({
    map,
    waves: [],
    lives: CLIP_POOL,
    money: CLIP_POOL,
    towers: clip.towers.map(({ kind, tile }) => ({ kind, tile })),
  });
  clip.towers.forEach(({ kind, level }, index) => {
    if (!Number.isInteger(level) || level < 1 || level > TOWER_LEVELS[kind].length + 1)
      throw new RangeError(`Menu clip ${kind}: no level ${level}`);
    const towerId = game.state.towers[index]!.id;
    for (let at = 1; at < level; at++) game.upgradeTower(towerId);
  });
  const spawnTicks = clipTicks(clip.spawnEveryMs);
  let ticks = 0;
  let spawned = 0;
  const spawnsPerLoop = clipTicks(clip.loopMs) / spawnTicks;
  const slots = new Map<number, number>();
  return {
    ...game,
    get state() {
      return game.state;
    },
    tick(dtMs) {
      if (ticks % spawnTicks === 0) {
        const { kind, dies } = clip.spawns[spawned % clip.spawns.length]!;
        const id = game.spawnEnemy(kind, { hpScale: dies ? 1 : clip.survivorHpScale });
        slots.set(id, spawned % spawnsPerLoop);
        spawned++;
        for (const known of slots.keys()) if (!game.state.enemies.some((e) => e.id === known)) slots.delete(known);
      }
      ticks++;
      game.tick(dtMs);
    },
    animKey: (id) => slots.get(id) ?? id,
  };
}

/**
 * Where the camera looks `ms` into the clip, in tiles: out from `from` to `to` in the first half of the loop and back
 * in the second, eased so it slows at each end, so it is where it started once a loop.
 */
export function clipPanAt({ pan: { from, to }, loopMs }: Pick<MenuClip, 'pan' | 'loopMs'>, ms: number): Position {
  const t = (((ms % loopMs) + loopMs) % loopMs) / loopMs;
  const leg = t < 0.5 ? t * 2 : 2 - t * 2;
  const eased = (1 - Math.cos(Math.PI * leg)) / 2;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

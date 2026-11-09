import type { DemoPan, DemoTower } from '../data/demo';
import { TOWER_LEVELS } from '../data/towers';
import { createEmitter } from './events';
import { isGameOver, type Game, type GameEvents } from './game';
import type { MapData, Position } from './map';
import { setUpGame } from './scenario';
import type { WaveData } from './waves';

/**
 * The Lives and Money a demo game starts with: far more than it can lose or spend, so it never ends in Defeat. Neither
 * is shown.
 */
export const DEMO_POOL = 1_000_000;

/** A demo's wave timer: the next wave comes this soon after the last, so the field stays busy. */
export const DEMO_WAVE_AFTER_MS = 5000;

/** Every game event type, so a demo forwards each one (a new event type must be added here to type-check). */
const EVENT_TYPES: Readonly<Record<keyof GameEvents, true>> = {
  enemyLeaked: true,
  towerFired: true,
  shellFired: true,
  shellLanded: true,
  enemyKilled: true,
  dismounted: true,
  towerSold: true,
  waveStarted: true,
  waveCleared: true,
  victory: true,
  defeat: true,
};

/** A game that plays itself behind the menu and never ends (#402). */
export interface DemoGame extends Game {
  /** How many times it has reset after its last wave. */
  readonly loops: number;
}

export interface DemoSetup {
  readonly map: MapData;
  readonly waves: readonly WaveData[];
  readonly towers: readonly DemoTower[];
}

/**
 * The real game, set up from a demo script: the towers placed free and raised to their levels, Lives and Money from
 * `DEMO_POOL`, the first wave called in (the wave timers bring the rest). When it ends it quietly swaps in a fresh copy of that setup.
 * Events come from whichever copy is playing, so listeners survive a reset; tower ids come back the same, so their
 * views do too. Throws, like `setUpGame`, for a tower that can't be placed, or a level its kind doesn't have.
 */
export function createDemoGame({ map, waves, towers }: DemoSetup): DemoGame {
  const events = createEmitter<GameEvents>();
  const setUp = (): Game => {
    const game = setUpGame({
      map,
      waves: waves.map((wave) => ({ ...wave, afterMs: DEMO_WAVE_AFTER_MS })),
      lives: DEMO_POOL,
      money: DEMO_POOL,
      towers: towers.map(({ kind, tile }) => ({ kind, tile })),
    });
    towers.forEach(({ kind, level }, index) => {
      if (!Number.isInteger(level) || level < 1 || level > TOWER_LEVELS[kind].length + 1)
        throw new RangeError(`Demo ${kind}: no level ${level}`);
      const towerId = game.state.towers[index]!.id;
      for (let at = 1; at < level; at++) game.upgradeTower(towerId);
    });
    for (const type of Object.keys(EVENT_TYPES) as (keyof GameEvents)[])
      game.events.on(type, (event) => events.emit(type, event));
    // Wave timers bring the rest on their own; the first is called in at once.
    game.callNextWave();
    return game;
  };
  let current = setUp();
  let loops = 0;
  return {
    get state() {
      return current.state;
    },
    get loops() {
      return loops;
    },
    events,
    tick(dtMs) {
      current.tick(dtMs);
      if (!isGameOver(current.state.phase)) return;
      current = setUp();
      loops++;
    },
    spawnEnemy: (kind) => current.spawnEnemy(kind),
    callNextWave: () => current.callNextWave(),
    placeTower: (kind, tile) => current.placeTower(kind, tile),
    canPlaceTower: (kind, tile) => current.canPlaceTower(kind, tile),
    upgradeTower: (towerId) => current.upgradeTower(towerId),
    canUpgradeTower: (towerId) => current.canUpgradeTower(towerId),
    sellTower: (towerId) => current.sellTower(towerId),
    canSellTower: (towerId) => current.canSellTower(towerId),
  };
}

/** The script at `rotation`, wrapping round, so each time the demo starts it can show the next map. */
export function demoScriptAt<T>(scripts: readonly T[], rotation: number): T {
  if (scripts.length === 0) throw new RangeError('No demo scripts');
  return scripts[((rotation % scripts.length) + scripts.length) % scripts.length]!;
}

/**
 * Where the camera looks `ms` into the pan, in tiles: out from `from` to `to` in the first half of the period and back
 * in the second, eased so it slows at each end.
 */
export function panAt({ from, to, periodMs }: DemoPan, ms: number): Position {
  const t = (((ms % periodMs) + periodMs) % periodMs) / periodMs;
  const leg = t < 0.5 ? t * 2 : 2 - t * 2;
  const eased = (1 - Math.cos(Math.PI * leg)) / 2;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

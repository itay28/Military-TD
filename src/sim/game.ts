import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { createRoute, type Enemy } from './enemies';
import { createEmitter, type Events } from './events';
import type { MapData } from './map';
import { createMap } from './map';

export interface GameConfig {
  readonly map: MapData;
  readonly lives: number;
}

export interface GameState {
  readonly timeMs: number;
  readonly lives: number;
  /** In spawn order. */
  readonly enemies: readonly Enemy[];
}

export interface GameEvents {
  /** An enemy reached the Path end and was removed. `lives` is what's left after the leak. */
  enemyLeaked: { readonly enemy: Enemy; readonly lives: number };
}

export interface Game {
  readonly state: GameState;
  readonly events: Events<GameEvents>;
  /** Advances the game by `dtMs` milliseconds. Throws RangeError for a negative or non-finite dt. */
  tick(dtMs: number): void;
  /** Spawns an enemy at the Path start and returns its id. */
  spawnEnemy(kind: EnemyKind): number;
}

/** Slack for float sums of tick distances, so an enemy due at the end on a tick arrives on it. */
const DISTANCE_EPSILON = 1e-9;

export function createGame(config: GameConfig): Game {
  const route = createRoute(createMap(config.map).waypointPositions);
  const state: { timeMs: number; lives: number; enemies: Enemy[] } = { timeMs: 0, lives: config.lives, enemies: [] };
  const events = createEmitter<GameEvents>();
  let nextId = 1;

  return {
    state,
    events: { on: events.on },
    tick(dtMs) {
      if (!Number.isFinite(dtMs) || dtMs < 0)
        throw new RangeError(`tick(dtMs): ${dtMs} is not a finite, non-negative time`);
      state.timeMs += dtMs;
      const walking: Enemy[] = [];
      const leaks: GameEvents['enemyLeaked'][] = [];
      for (const enemy of state.enemies) {
        const distance = enemy.distance + (enemy.speed * dtMs) / 1000;
        if (distance >= route.length - DISTANCE_EPSILON) {
          state.lives = Math.max(0, state.lives - ENEMY_STATS[enemy.kind].leakCost);
          const leaked = { ...enemy, distance: route.length, position: route.positionAt(route.length) };
          leaks.push({ enemy: leaked, lives: state.lives });
        } else {
          walking.push({ ...enemy, distance, position: route.positionAt(distance) });
        }
      }
      state.enemies = walking;
      // Emit once the state is settled, so listeners read this tick's state.
      for (const leak of leaks) events.emit('enemyLeaked', leak);
    },
    spawnEnemy(kind) {
      const { maxHp, speed } = ENEMY_STATS[kind];
      const id = nextId++;
      state.enemies.push({ id, kind, hp: maxHp, maxHp, speed, distance: 0, position: route.positionAt(0) });
      return id;
    },
  };
}

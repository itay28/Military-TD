import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { createPathLine, walkEnemies, type Enemy } from './enemies';
import { createEmitter, type Events } from './events';
import { createMap, type MapData } from './map';

export interface GameConfig {
  readonly map: MapData;
  readonly lives: number;
}

/** The live game state, read-only to callers. Read it through `game.state` each time: arrays are replaced on tick. */
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
  /** Spawns an enemy at the Path start and returns its id. Waves (#10) will call this; until then it's a plain command. */
  spawnEnemy(kind: EnemyKind): number;
}

export function createGame(config: GameConfig): Game {
  const line = createPathLine(createMap(config.map).waypointPositions);
  const state: { timeMs: number; lives: number; enemies: Enemy[] } = { timeMs: 0, lives: config.lives, enemies: [] };
  const emitter = createEmitter<GameEvents>();
  let nextId = 1;

  return {
    state,
    events: { on: emitter.on },
    tick(dtMs) {
      if (!Number.isFinite(dtMs) || dtMs < 0)
        throw new RangeError(`tick(dtMs): ${dtMs} is not a finite, non-negative time`);
      state.timeMs += dtMs;
      const { walking, leaked } = walkEnemies(state.enemies, line, dtMs);
      state.enemies = walking;
      const leaks = leaked.map((enemy) => {
        state.lives = Math.max(0, state.lives - enemy.leakCost);
        return { enemy, lives: state.lives };
      });
      // Emit once the state is settled, so listeners read this tick's state.
      for (const leak of leaks) emitter.emit('enemyLeaked', leak);
    },
    spawnEnemy(kind) {
      const id = nextId++;
      const stats = ENEMY_STATS[kind];
      state.enemies.push({ ...stats, id, kind, hp: stats.maxHp, distance: 0, position: line.positionAt(0) });
      return id;
    },
  };
}

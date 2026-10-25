import { ENEMY_STATS, type EnemyKind } from '../data/enemies';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import { createPathLine, walkEnemies, type Enemy } from './enemies';
import { createEmitter, type Events } from './events';
import { createMap, type GameMap, type MapData, type Tile } from './map';
import { fireTowers, towerAt, type Shot, type Tower } from './towers';
import { createSpawnSchedule, validateWaves, type SpawnSchedule, type WaveData } from './waves';

/** The one fixed step, in ms. The Game scene and the scenario runner both tick with it. */
export const TICK_MS = 1000 / 60;

export interface GameConfig {
  readonly map: MapData;
  readonly lives: number;
  /** Money at the start. */
  readonly money: number;
  readonly waves: readonly WaveData[];
}

/** Build phase between waves, Wave phase while one runs; Victory and Defeat end the game. */
export type Phase = 'build' | 'wave' | 'victory' | 'defeat';

/** The live game state, read-only to callers. Read it through `game.state` each time: arrays are replaced on tick. */
export interface GameState {
  /** The validated map, for drawing and placement checks. */
  readonly map: GameMap;
  readonly timeMs: number;
  readonly lives: number;
  readonly money: number;
  /** In spawn order. */
  readonly enemies: readonly Enemy[];
  /** In placement order. */
  readonly towers: readonly Tower[];
  readonly phase: Phase;
  /** The latest started wave, counting from 1; 0 before the first. */
  readonly waveNumber: number;
  readonly totalWaves: number;
}

export interface GameEvents {
  /** An enemy reached the Path end and was removed. `lives` is what's left after the leak. */
  enemyLeaked: { readonly enemy: Enemy; readonly lives: number };
  /** A tower hit an enemy (hitscan), for tracers: from the tower's tile center to `position`. */
  towerFired: Shot;
  /** An enemy's HP reached 0 and it was removed. `reward` is the Money it paid, already in `state.money`. */
  enemyKilled: { readonly enemy: Enemy; readonly reward: number };
  waveStarted: { readonly waveNumber: number };
  /** Every enemy of the wave has spawned and none is left alive. */
  waveCleared: { readonly waveNumber: number };
  /** The last wave was cleared with Lives left. The game is over. */
  victory: { readonly lives: number };
  /** Lives reached 0. `waveNumber` is the latest started wave (0 if none had started). The game is over. */
  defeat: { readonly waveNumber: number };
}

/** What a command returns: success (with any `Value` it reports), or the reason it was refused (and changed nothing). */
export type CommandResult<Reason extends string, Value extends object = object> =
  ({ readonly ok: true } & Value) | { readonly ok: false; readonly reason: Reason };

/** Why placeTower refused, in the order it checks. */
export type PlaceTowerRefusal = 'gameEnded' | 'notBuildable' | 'occupied' | 'insufficientMoney';

export interface Game {
  readonly state: GameState;
  readonly events: Events<GameEvents>;
  /** Advances the game by `dtMs` milliseconds; does nothing once it's over. Throws RangeError for a negative or non-finite dt. */
  tick(dtMs: number): void;
  /** Spawns an enemy at the Path start, outside any wave, and returns its id. For tests and scenarios. */
  spawnEnemy(kind: EnemyKind): number;
  /**
   * Starts the next wave: its first enemy spawns at once, the rest one every spacing.
   * Refuses with `noWavesLeft` once every wave has started (so after Victory too), else `notBuildPhase`
   * outside the Build phase (during a wave, after Defeat).
   */
  startWave(): CommandResult<'noWavesLeft' | 'notBuildPhase'>;
  /**
   * Places a tower on `tile` for its cost, in the Build or Wave phase, and returns its id.
   * Refuses, in this order: `gameEnded` after Victory or Defeat, `notBuildable` off the grid or on the Path,
   * `occupied` where a tower stands, `insufficientMoney` when Money is below the cost.
   */
  placeTower(kind: TowerKind, tile: Tile): CommandResult<PlaceTowerRefusal, { readonly towerId: number }>;
  /** Whether `placeTower(kind, tile)` would succeed now, or the reason it would refuse. Changes nothing. */
  canPlaceTower(kind: TowerKind, tile: Tile): CommandResult<PlaceTowerRefusal>;
}

/** Builds a game from data. Throws InvalidMapError when the map is malformed, RangeError for a malformed wave. */
export function createGame(config: GameConfig): Game {
  const map = createMap(config.map);
  validateWaves(config.waves);
  const line = createPathLine(map.waypointPositions);
  const state: { -readonly [K in keyof GameState]: GameState[K] } & { enemies: Enemy[]; towers: Tower[] } = {
    map,
    timeMs: 0,
    lives: config.lives,
    money: config.money,
    enemies: [],
    towers: [],
    phase: 'build',
    waveNumber: 0,
    totalWaves: config.waves.length,
  };
  const emitter = createEmitter<GameEvents>();
  let nextId = 1;
  /** The running wave, from startWave until it is cleared. */
  let wave: { readonly data: WaveData; readonly schedule: SpawnSchedule; readonly startMs: number } | undefined;

  const createEnemy = (kind: EnemyKind): Enemy => {
    const stats = ENEMY_STATS[kind];
    return { ...stats, id: nextId++, kind, hp: stats.maxHp, distance: 0, position: line.positionAt(0) };
  };

  const canPlaceTower = (kind: TowerKind, tile: Tile): CommandResult<PlaceTowerRefusal> => {
    if (state.phase === 'victory' || state.phase === 'defeat') return { ok: false, reason: 'gameEnded' };
    if (!map.isBuildable(tile)) return { ok: false, reason: 'notBuildable' };
    if (towerAt(state.towers, tile)) return { ok: false, reason: 'occupied' };
    if (state.money < TOWER_STATS[kind].cost) return { ok: false, reason: 'insufficientMoney' };
    return { ok: true };
  };

  return {
    state,
    events: { on: emitter.on },
    tick(dtMs) {
      if (!Number.isFinite(dtMs) || dtMs < 0)
        throw new RangeError(`tick(dtMs): ${dtMs} is not a finite, non-negative time`);
      if (state.phase === 'victory' || state.phase === 'defeat') return;
      state.timeMs += dtMs;
      const { walking, leaked } = walkEnemies(state.enemies, line, dtMs);
      const enemies = [...walking];
      if (wave) {
        // A spawn due mid-tick walks the rest of the tick, so tick size doesn't change where enemies are.
        const elapsedMs = state.timeMs - wave.startMs;
        for (const spawnMs of wave.schedule.take(elapsedMs)) {
          const spawned = walkEnemies([createEnemy(wave.data.kind)], line, Math.max(0, elapsedMs - spawnMs));
          enemies.push(...spawned.walking);
          leaked.push(...spawned.leaked);
        }
      }
      const leaks = leaked.map((enemy) => {
        state.lives = Math.max(0, state.lives - enemy.leakCost);
        return { enemy, lives: state.lives };
      });
      const fired = fireTowers(state.towers, enemies, dtMs);
      state.towers = fired.towers;
      state.enemies = fired.enemies;
      for (const enemy of fired.kills) state.money += enemy.reward;
      let cleared = false;
      if (state.lives === 0) {
        wave = undefined;
        state.phase = 'defeat';
      } else if (wave?.schedule.finished && state.enemies.length === 0) {
        cleared = true;
        wave = undefined;
        state.phase = state.waveNumber === state.totalWaves ? 'victory' : 'build';
      }
      // Emit once the state is settled, so listeners read this tick's state.
      for (const leak of leaks) emitter.emit('enemyLeaked', leak);
      for (const shot of fired.shots) emitter.emit('towerFired', shot);
      for (const enemy of fired.kills) emitter.emit('enemyKilled', { enemy, reward: enemy.reward });
      if (cleared) emitter.emit('waveCleared', { waveNumber: state.waveNumber });
      if (state.phase === 'victory') emitter.emit('victory', { lives: state.lives });
      if (state.phase === 'defeat') emitter.emit('defeat', { waveNumber: state.waveNumber });
    },
    spawnEnemy(kind) {
      const enemy = createEnemy(kind);
      state.enemies.push(enemy);
      return enemy.id;
    },
    startWave() {
      const next = config.waves[state.waveNumber];
      if (!next) return { ok: false, reason: 'noWavesLeft' };
      if (state.phase !== 'build') return { ok: false, reason: 'notBuildPhase' };
      wave = { data: next, schedule: createSpawnSchedule(next), startMs: state.timeMs };
      state.phase = 'wave';
      state.waveNumber++;
      state.enemies.push(...wave.schedule.take(0).map(() => createEnemy(next.kind)));
      emitter.emit('waveStarted', { waveNumber: state.waveNumber });
      return { ok: true };
    },
    placeTower(kind, tile) {
      const allowed = canPlaceTower(kind, tile);
      if (!allowed.ok) return allowed;
      const stats = TOWER_STATS[kind];
      const towerId = nextId++;
      state.money -= stats.cost;
      state.towers.push({ ...stats, id: towerId, kind, tile, cooldownMs: 0 });
      return { ok: true, towerId };
    },
    canPlaceTower,
  };
}

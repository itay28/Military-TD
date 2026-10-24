import { createMap, type GameMap, type MapData } from './map';

/** The one fixed step, in ms. The Game scene and the scenario runner both tick with it. */
export const TICK_MS = 1000 / 60;

export interface GameConfig {
  readonly map: MapData;
}

export interface GameState {
  readonly map: GameMap;
  /** Simulated time since the game was created. */
  readonly timeMs: number;
}

export interface Game {
  readonly state: GameState;
  /** Advances the sim by dtMs. Callers pass TICK_MS so the same inputs always give the same result. */
  tick(dtMs: number): void;
}

/** Builds a game from data. Throws InvalidMapError when the map is malformed. */
export function createGame(config: GameConfig): Game {
  const state = { map: createMap(config.map), timeMs: 0 };
  return {
    state,
    tick(dtMs) {
      state.timeMs += dtMs;
    },
  };
}

import type { Pixel } from '../scenes/coords';
import type { Game, GameState } from '../sim/game';
import { applyCommand, type CommandOutcome, type GameSetup, type ScenarioCommand } from '../sim/scenario';

/** What the Game scene lends test mode. `game` is read each time: a restart replaces it. */
export interface TestHooks {
  readonly game: Game;
  /** Runs `ticks` fixed ticks, as the real-time loop would. */
  step(ticks: number): void;
  /** Restarts the scene with a new game built from `setup`; resolves once it's running. */
  load(setup: GameSetup): Promise<void>;
  /** What the scene draws now, read from its display objects. */
  view(): TestView;
}

/** Named scenarios' setups, loaded on demand. */
export type ScenarioLoaders = Readonly<Record<string, () => Promise<GameSetup>>>;

/** The game state without the map (which has methods), so it survives `page.evaluate`. */
export type TestState = Omit<GameState, 'map'>;

/** What the Game scene draws now, in canvas pixels, read from its display objects. */
export interface TestView {
  /** The range ring of the tower under the pointer. `towerId` is null when no tower is hovered. */
  readonly rangeRing: { readonly visible: boolean; readonly towerId: number | null; readonly center: Pixel };
  /** The tracers drawn on the next frame, each from a tower to where its shot hit. */
  readonly tracers: readonly { readonly from: Pixel; readonly to: Pixel; readonly alpha: number }[];
  /** Each display object's layer (`map`, `towers`, `enemies`, …), back to front as Phaser renders them; repeats collapsed. */
  readonly drawOrder: readonly string[];
}

/** `window.__TD__` with `?test=1` (ADR-0003). */
export interface TestApi {
  /** A copy of the game state now. */
  state(): TestState;
  /** Gives the game a command, as a player (or a scenario script) would, and returns its result. */
  command(command: ScenarioCommand): CommandOutcome;
  /** Runs `ticks` fixed ticks and returns the state after them. Throws RangeError unless `ticks` is a whole number ≥ 0. */
  step(ticks: number): TestState;
  /**
   * Restarts the game with the setup of `tests/scenarios/<name>.scenario.ts` (map, Lives, Money, towers, waves).
   * Its script and stop condition don't run: the test drives the game from there. Rejects for an unknown name.
   */
  loadScenario(name: string): Promise<void>;
  /** A copy of what the Game scene draws now. It changes on the next frame; tracers fade on frame time even when paused. */
  view(): TestView;
}

declare global {
  interface Window {
    __TD__?: TestApi;
  }
}

export function createTestApi(hooks: TestHooks, scenarios: ScenarioLoaders): TestApi {
  const state = (): TestState => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { map, ...rest } = hooks.game.state;
    return structuredClone(rest);
  };
  return {
    state,
    command: (command) => applyCommand(hooks.game, command),
    step(ticks) {
      if (!Number.isInteger(ticks) || ticks < 0)
        throw new RangeError(`step(${ticks}): ticks must be a whole number of at least 0`);
      hooks.step(ticks);
      return state();
    },
    async loadScenario(name) {
      const load = scenarios[name];
      if (!load) throw new Error(`No scenario named "${name}". There are: ${Object.keys(scenarios).sort().join(', ')}`);
      await hooks.load(await load());
    },
    view: () => structuredClone(hooks.view()),
  };
}

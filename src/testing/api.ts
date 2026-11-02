import type { EnemyKind } from '../data/enemies';
import type { Pixel } from '../scenes/coords';
import type { EffectKind } from '../scenes/effects';
import type { Game, GameState } from '../sim/game';
import type { Tile } from '../sim/map';
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

/** The game state without the map (which has methods), so it survives `page.evaluate`, plus the map's id. */
export type TestState = Omit<GameState, 'map'> & { readonly mapId: string };

/** What the Game scene draws now, in canvas pixels, read from its display objects. */
export interface TestView {
  /** The range ring of the tower under the pointer. `towerId` is null when no tower is hovered. */
  readonly rangeRing: { readonly visible: boolean; readonly towerId: number | null; readonly center: Pixel };
  /** The id of every tower whose range ring is drawn (hovered, selected, or all with Always show tower ranges), sorted. */
  readonly rangeRings: readonly number[];
  /** The tracers drawn on the next frame, each from a tower to where its shot hit. */
  readonly tracers: readonly { readonly from: Pixel; readonly to: Pixel; readonly alpha: number }[];
  /** The combat effects (muzzle flash, explosion, death puff) drawn on the next frame. */
  readonly effects: readonly {
    readonly kind: EffectKind;
    readonly at: Pixel;
    readonly progress: number;
  }[];
  /**
   * The Ghost under the pointer: shown only while a mouse hovers, or a finger drags over, a tile with a build kind
   * selected. `tile` is null when it is hidden.
   */
  readonly ghost: { readonly visible: boolean; readonly tile: Tile | null };
  /** The camera over the map: the world pixel at the canvas's top-left corner, and the zoom. */
  readonly camera: { readonly scrollX: number; readonly scrollY: number; readonly zoom: number };
  /** Each display object's layer (`map`, `towers`, `enemies`, …), back to front as Phaser renders them; repeats collapsed. */
  readonly drawOrder: readonly string[];
  /** Whether the sprite atlas loaded. Without it, everything is drawn as shapes. */
  readonly sprites: boolean;
  /** How the map was drawn: from the tileset, or as flat shapes when the atlas lacks a tileset frame. */
  readonly mapTiles: 'sprites' | 'shapes';
  /**
   * Each enemy drawn: `facing` is the way it is heading, in radians on the canvas (0 east, π/2 south); `frame` its
   * movement animation frame (always 0 with `?anim=0`).
   */
  readonly enemies: readonly {
    readonly id: number;
    readonly kind: EnemyKind;
    readonly facing: number;
    readonly frame: number;
  }[];
  /**
   * Each tower's turret angle in radians (0 east, −π/2 north), as turned so far toward its target. Tracked for every
   * tower, drawn only for one with a turret sprite.
   */
  readonly turrets: readonly { readonly towerId: number; readonly angle: number }[];
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
    const { map, ...rest } = hooks.game.state;
    return { ...structuredClone(rest), mapId: map.id };
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

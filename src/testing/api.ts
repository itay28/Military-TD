import type { TowerKind } from '../data/towers';
import type { EnemyKind } from '../data/enemies';
import type { SpriteKind } from '../data/sprites';
import type { Pixel } from '../scenes/coords';
import type { DecalKind } from '../data/display';
import type { EffectKind } from '../scenes/effects';
import type { Game, GameState } from '../sim/game';
import type { Tile } from '../sim/map';
import { applyCommand, type CommandOutcome, type GameSetup, type ScenarioCommand } from '../sim/scenario';

/** What the Game scene lends test mode. `game` is read each time: a restart replaces it. */
export interface TestHooks {
  readonly game: Game;
  /** Runs `ticks` fixed ticks, as the real-time loop would. */
  step(ticks: number): void;
  /** With `?clip=1`, moves the menu clip on `frames` video frames: the sim, the cosmetics and the pan. Throws otherwise. */
  clipFrames(frames: number): void;
  /** Restarts the scene with a new game built from `setup`; resolves once it's running. */
  load(setup: GameSetup): Promise<void>;
  /** What the scene draws now, read from its display objects. */
  view(): TestView;
  /** Forces the onboarding hints on (from the start, any map, saved flag ignored) or off, for this game and the next. */
  setHints(on: boolean): void;
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
  /** The aftermath decals (wrecks, crash marks, craters, fallen infantry) drawn on the next frame; none with ?anim=0. */
  readonly decals: readonly { readonly kind: DecalKind; readonly alpha: number }[];
  /** The DPS meter's highlight (#244): the kind clicked there, and the id of every tower of it that is outlined. */
  readonly highlight: { readonly kind: TowerKind | null; readonly towerIds: readonly number[] };
  /**
   * The Ghost under the pointer: shown only while a mouse hovers, or a finger drags over, a tile with a build kind
   * selected. `tile` is null when it is hidden.
   */
  readonly ghost: { readonly visible: boolean; readonly tile: Tile | null };
  /** The map cursor (#356): its tile, and whether its highlight is drawn (the map has keyboard focus). */
  readonly cursor: { readonly col: number; readonly row: number; readonly shown: boolean };
  /** The camera over the map: the world pixel at the canvas's top-left corner, and the zoom. */
  readonly camera: { readonly scrollX: number; readonly scrollY: number; readonly zoom: number };
  /** Each display object's layer (`map`, `towers`, `enemies`, …), back to front as Phaser renders them; repeats collapsed. */
  readonly drawOrder: readonly string[];
  /** Whether the sprite atlas loaded. Without it, everything is drawn as shapes. */
  readonly sprites: boolean;
  /**
   * How the map was drawn: its painted ground image (#312), else the tileset, else flat shapes when the atlas lacks a
   * tileset frame.
   */
  readonly mapTiles: 'image' | 'sprites' | 'shapes';
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
   * The enemy card open now: the enemy it shows, its kind and the name it gives, and whether a tap pinned it (rather
   * than a hovering mouse). Null when it is closed.
   */
  readonly enemyCard: {
    readonly enemyId: number;
    readonly kind: EnemyKind;
    readonly name: string;
    readonly pinned: boolean;
  } | null;
  /**
   * Each tower's turret angle in radians (0 east, −π/2 north), as turned so far toward its target. Tracked for every
   * tower, drawn only for one with a turret sprite.
   */
  readonly turrets: readonly { readonly towerId: number; readonly angle: number }[];
  /** The kinds on the map drawn from a render (ADR-0009) rather than Kenney's sprites, sorted. */
  readonly rendered: readonly SpriteKind[];
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
   * With `?clip=1`, moves the menu clip on `frames` video frames (#568); the next render draws the last. Throws
   * RangeError unless `frames` is a whole number ≥ 0, and an Error without `?clip=1`.
   */
  clipFrames(frames: number): void;
  /**
   * Restarts the game with the setup of `tests/scenarios/<name>.scenario.ts` (map, Lives, Money, towers, waves).
   * Its script and stop condition don't run: the test drives the game from there. Rejects for an unknown name.
   */
  loadScenario(name: string): Promise<void>;
  /** A copy of what the Game scene draws now. It changes on the next frame; tracers fade on frame time even when paused. */
  view(): TestView;
  /**
   * Forces the onboarding hints (#68) on or off. Test mode starts with them off, so specs that don't test hints never
   * see one. On, they restart from the first hint whatever the map or saved flag; a skip or finish still saves the flag.
   */
  setHints(on: boolean): void;
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
    clipFrames(frames) {
      if (!Number.isInteger(frames) || frames < 0)
        throw new RangeError(`clipFrames(${frames}): frames must be a whole number of at least 0`);
      hooks.clipFrames(frames);
    },
    async loadScenario(name) {
      const load = scenarios[name];
      if (!load) throw new Error(`No scenario named "${name}". There are: ${Object.keys(scenarios).sort().join(', ')}`);
      await hooks.load(await load());
    },
    view: () => structuredClone(hooks.view()),
    setHints: (on) => hooks.setHints(on),
  };
}

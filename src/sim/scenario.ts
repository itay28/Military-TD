import type { EnemyKind } from '../data/enemies';
import { MVP_MAP } from '../data/maps';
import { START_LIVES, START_MONEY } from '../data/start';
import { TOWER_STATS, type TowerKind } from '../data/towers';
import { MVP_WAVES } from '../data/waves';
import { createGame, TICK_MS, type CommandResult, type Game, type GameEvents, type GameState } from './game';
import { tileKey, type MapData, type Tile } from './map';
import type { WaveData } from './waves';

/** A command a scenario script can give, the same as a player (or a test) would. */
export type ScenarioCommand =
  | { readonly type: 'placeTower'; readonly kind: TowerKind; readonly tile: Tile }
  | { readonly type: 'startWave' }
  | { readonly type: 'spawnEnemy'; readonly kind: EnemyKind };

/** Runs `command` after `atTick` ticks: 0 is before the first tick. */
export interface ScriptStep {
  readonly atTick: number;
  readonly command: ScenarioCommand;
}

/**
 * When a scenario run stops: when the game ends, after a number of ticks, or at the end of the tick a game event fires.
 * A run always stops when the game ends.
 */
export type StopCondition = 'end' | { readonly ticks: number } | { readonly event: keyof GameEvents };

/** A game situation to run headlessly (ADR-0003). Left-out setup takes the MVP game's values. */
export interface Scenario {
  readonly map?: MapData;
  readonly lives?: number;
  readonly money?: number;
  /** Placed before the first tick, free: they don't come out of `money`. */
  readonly towers?: readonly { readonly kind: TowerKind; readonly tile: Tile }[];
  /** Overrides the game's waves. */
  readonly waves?: readonly WaveData[];
  readonly script?: readonly ScriptStep[];
  /** A bot that starts the next wave whenever the game is in the Build phase, so a run can play a whole game. */
  readonly autoStartWaves?: boolean;
  readonly until: StopCondition;
  /** Stops a run that hasn't met `until` by then, with outcome `timeout`. Defaults to an hour of game time. */
  readonly maxTicks?: number;
}

const DEFAULT_MAX_TICKS = 60 * 60 * 60;

/** `victory` or `defeat` when the game ended; `stopped` when `until` was met first; `timeout` at `maxTicks`. */
export type ScenarioOutcome = 'victory' | 'defeat' | 'stopped' | 'timeout';

/** What a scenario command returned: `towerId` for a placed tower, `enemyId` for a spawned enemy. */
export type CommandOutcome = CommandResult<string, { readonly towerId?: number; readonly enemyId?: number }>;

/**
 * One entry in a run's log: a game event with its payload, or a command and what it returned.
 * `tick` is the number of ticks run when it happened.
 */
export type ScenarioEvent =
  | { [K in keyof GameEvents]: { readonly tick: number; readonly type: K } & GameEvents[K] }[keyof GameEvents]
  | {
      readonly tick: number;
      readonly type: 'command';
      readonly command: ScenarioCommand;
      readonly result: CommandOutcome;
    };

export interface ScenarioResult {
  readonly outcome: ScenarioOutcome;
  readonly finalState: GameState;
  /** Everything that happened, in order. */
  readonly events: readonly ScenarioEvent[];
  /** Fixed `TICK_MS` ticks run. */
  readonly ticks: number;
}

// A Record, so adding a game event without logging it is a type error.
const GAME_EVENT_TYPES = Object.keys({
  enemyLeaked: true,
  towerFired: true,
  enemyKilled: true,
  waveStarted: true,
  waveCleared: true,
  victory: true,
  defeat: true,
} satisfies Record<keyof GameEvents, true>) as (keyof GameEvents)[];

/**
 * Builds the game a scenario describes and runs it in fixed ticks, as fast as the CPU allows, until it stops.
 * Throws when the setup is invalid: a malformed map or wave (as `createGame`), a pre-placed tower that can't be placed,
 * or a script step whose `atTick` isn't a whole number ≥ 0.
 */
export function runScenario(scenario: Scenario): ScenarioResult {
  const towers = scenario.towers ?? [];
  const towersCost = towers.reduce((sum, { kind }) => sum + TOWER_STATS[kind].cost, 0);
  const game = createGame({
    map: scenario.map ?? MVP_MAP,
    lives: scenario.lives ?? START_LIVES,
    // Pre-placed towers are placed like any other, with their cost added first, so they come free.
    money: (scenario.money ?? START_MONEY) + towersCost,
    waves: scenario.waves ?? MVP_WAVES,
  });
  for (const { kind, tile } of towers) {
    const placed = game.placeTower(kind, tile);
    if (!placed.ok) throw new Error(`Pre-placed ${kind} at ${tileKey(tile)} can't be placed: ${placed.reason}`);
  }
  for (const { atTick } of scenario.script ?? [])
    if (!Number.isInteger(atTick) || atTick < 0)
      throw new RangeError(`script step at tick ${atTick}: atTick must be a whole number of at least 0`);
  const events: ScenarioEvent[] = [];
  let ticks = 0;
  const { until, maxTicks = DEFAULT_MAX_TICKS } = scenario;
  let untilEventFired = false;
  for (const type of GAME_EVENT_TYPES)
    game.events.on(type, (event) => {
      events.push({ tick: ticks, type, ...event } as ScenarioEvent);
      if (typeof until === 'object' && 'event' in until && until.event === type) untilEventFired = true;
    });
  const script = [...(scenario.script ?? [])].sort((a, b) => a.atTick - b.atTick);
  let nextStep = 0;

  const outcome = (): ScenarioOutcome | undefined => {
    const { phase } = game.state;
    if (phase === 'victory' || phase === 'defeat') return phase;
    if (untilEventFired || (typeof until === 'object' && 'ticks' in until && ticks >= until.ticks)) return 'stopped';
    if (ticks >= maxTicks) return 'timeout';
    return undefined;
  };
  const command = (command: ScenarioCommand) => {
    // Log the command ahead of the events it causes (startWave emits waveStarted).
    const at = events.length;
    const result = run(game, command);
    events.splice(at, 0, { tick: ticks, type: 'command', command, result });
  };
  for (;;) {
    for (let step = script[nextStep]; step && step.atTick <= ticks; step = script[++nextStep]) command(step.command);
    const { phase, waveNumber, totalWaves } = game.state;
    if (scenario.autoStartWaves && phase === 'build' && waveNumber < totalWaves) command({ type: 'startWave' });
    const done = outcome();
    if (done) return { outcome: done, finalState: game.state, events, ticks };
    ticks++; // first, so events from this tick carry its number
    game.tick(TICK_MS);
  }
}

function run(game: Game, command: ScenarioCommand): CommandOutcome {
  switch (command.type) {
    case 'placeTower':
      return game.placeTower(command.kind, command.tile);
    case 'startWave':
      return game.startWave();
    case 'spawnEnemy':
      return { ok: true, enemyId: game.spawnEnemy(command.kind) };
  }
}

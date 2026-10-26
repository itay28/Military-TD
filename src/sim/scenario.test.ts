import { describe, expect, it } from 'vitest';
import { MVP_MAP } from '../data/maps';
import { START_LIVES, START_MONEY } from '../data/start';
import { WAVES } from '../data/waves';
import { TICK_MS } from './game';
import type { MapData } from './map';
import { runScenario, setUpGame } from './scenario';

// Path line through tile centers: right 3, then down 3. 6 tiles long, so an Infantry (1.5 tiles/s) leaks after 4 s.
const SMALL: MapData = {
  id: 'small',
  cols: 6,
  rows: 5,
  waypoints: [
    { col: 0, row: 1 },
    { col: 3, row: 1 },
    { col: 3, row: 4 },
  ],
};

const ONE_INFANTRY = [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }] as const;

describe('runScenario', () => {
  it('uses the MVP map, start Lives and Money, and the wave schedule when the scenario leaves them out', () => {
    const { finalState } = runScenario({ until: { ticks: 0 } });
    expect(finalState.map.id).toBe(MVP_MAP.id);
    expect(finalState.lives).toBe(START_LIVES);
    expect(finalState.money).toBe(START_MONEY);
    expect(finalState.totalWaves).toBe(WAVES.length);
  });

  it('until { ticks } stops after exactly that many fixed ticks, with outcome stopped', () => {
    const result = runScenario({ map: SMALL, until: { ticks: 90 } });
    expect(result.outcome).toBe('stopped');
    expect(result.ticks).toBe(90);
    expect(result.finalState.timeMs).toBeCloseTo(90 * TICK_MS);
  });

  it('a scripted command runs after its atTick ticks, and it and every game event are logged with their tick', () => {
    const { events } = runScenario({
      map: SMALL,
      waves: ONE_INFANTRY,
      script: [{ atTick: 10, command: { type: 'startWave' } }],
      until: { ticks: 300 },
    });
    expect(events.map((e) => e.type)).toEqual(['command', 'waveStarted', 'enemyLeaked', 'waveCleared', 'victory']);
    expect(events[0]).toEqual({ tick: 10, type: 'command', command: { type: 'startWave' }, result: { ok: true } });
    expect(events[1]).toEqual({ tick: 10, type: 'waveStarted', waveNumber: 1 });
    // 6 tiles at 1.5 tiles/s: the leak lands 4 s (240 ticks) after the wave starts.
    const leak = events[2];
    expect(leak).toMatchObject({ type: 'enemyLeaked', lives: START_LIVES - 1 });
    expect(leak?.tick).toBeGreaterThanOrEqual(249);
    expect(leak?.tick).toBeLessThanOrEqual(251);
    expect(events.slice(2).every((e) => e.tick === leak?.tick)).toBe(true);
  });

  it('a refused command is logged with its reason and the run goes on', () => {
    const { events, ticks } = runScenario({
      map: SMALL,
      script: [{ atTick: 0, command: { type: 'placeTower', kind: 'rifleNest', tile: { col: 1, row: 1 } } }],
      until: { ticks: 5 },
    });
    expect(events).toEqual([
      {
        tick: 0,
        type: 'command',
        command: { type: 'placeTower', kind: 'rifleNest', tile: { col: 1, row: 1 } },
        result: { ok: false, reason: 'notBuildable' },
      },
    ]);
    expect(ticks).toBe(5);
  });

  it("until 'end' runs to Victory and stops on that tick", () => {
    const result = runScenario({
      map: SMALL,
      waves: ONE_INFANTRY,
      script: [{ atTick: 0, command: { type: 'startWave' } }],
      until: 'end',
    });
    expect(result.outcome).toBe('victory');
    expect(result.ticks).toBe(result.events.at(-1)?.tick);
    expect(result.finalState.phase).toBe('victory');
  });

  it("until 'end' runs to Defeat when the leaks use up the Lives", () => {
    const result = runScenario({
      map: SMALL,
      lives: 1,
      waves: [{ groups: [{ kind: 'infantry', count: 3, spacingMs: 100, delayMs: 0 }] }],
      script: [{ atTick: 0, command: { type: 'startWave' } }],
      until: 'end',
    });
    expect(result.outcome).toBe('defeat');
    expect(result.events.filter((e) => e.type === 'enemyLeaked')).toHaveLength(1);
  });

  it('the game ending stops a run before its tick count, with the game outcome', () => {
    const result = runScenario({
      map: SMALL,
      waves: ONE_INFANTRY,
      script: [{ atTick: 0, command: { type: 'startWave' } }],
      until: { ticks: 10_000 },
    });
    expect(result.outcome).toBe('victory');
    expect(result.ticks).toBeLessThan(300);
  });

  it('until { event } stops at the end of the tick that emitted it', () => {
    const result = runScenario({
      map: SMALL,
      waves: [{ groups: [{ kind: 'infantry', count: 3, spacingMs: 1000, delayMs: 0 }] }],
      script: [{ atTick: 0, command: { type: 'startWave' } }],
      until: { event: 'enemyLeaked' },
    });
    expect(result.outcome).toBe('stopped');
    const leaks = result.events.filter((e) => e.type === 'enemyLeaked');
    expect(leaks).toHaveLength(1);
    expect(result.ticks).toBe(leaks[0]?.tick);
    expect(result.finalState.lives).toBe(START_LIVES - 1);
  });

  it('a run whose stop condition never comes stops at maxTicks with outcome timeout', () => {
    const result = runScenario({ map: SMALL, until: 'end', maxTicks: 500 });
    expect(result).toMatchObject({ outcome: 'timeout', ticks: 500 });
  });

  it('maxTicks defaults to an hour of game time', () => {
    expect(runScenario({ map: SMALL, until: 'end' })).toMatchObject({ outcome: 'timeout', ticks: 60 * 60 * 60 });
  });

  it('pre-placed towers stand on their tiles from the start and cost no Money', () => {
    const { finalState, events } = runScenario({
      map: SMALL,
      money: 0,
      towers: [
        { kind: 'rifleNest', tile: { col: 1, row: 2 } },
        { kind: 'rifleNest', tile: { col: 4, row: 2 } },
      ],
      until: { ticks: 0 },
    });
    expect(finalState.towers.map((t) => t.tile)).toEqual([
      { col: 1, row: 2 },
      { col: 4, row: 2 },
    ]);
    expect(finalState.money).toBe(0);
    expect(events).toEqual([]);
  });

  it('a pre-placed tower that cannot be placed throws, naming the tile and reason', () => {
    expect(() =>
      runScenario({ map: SMALL, towers: [{ kind: 'rifleNest', tile: { col: 1, row: 1 } }], until: 'end' }),
    ).toThrow(/1,1.*notBuildable/);
  });

  it('a script step at a negative or fractional tick throws RangeError', () => {
    for (const atTick of [-1, 2.5])
      expect(() => runScenario({ script: [{ atTick, command: { type: 'startWave' } }], until: 'end' })).toThrow(
        RangeError,
      );
  });

  it('autoStartWaves starts each wave whenever the game is in the Build phase, and logs it', () => {
    const result = runScenario({
      map: SMALL,
      waves: [
        { groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] },
        { groups: [{ kind: 'infantry', count: 2, spacingMs: 500, delayMs: 0 }] },
      ],
      autoStartWaves: true,
      until: 'end',
    });
    expect(result.outcome).toBe('victory');
    const starts = result.events.filter((e) => e.type === 'command');
    expect(starts).toHaveLength(2);
    expect(starts[0]).toMatchObject({ tick: 0, command: { type: 'startWave' }, result: { ok: true } });
    const firstCleared = result.events.find((e) => e.type === 'waveCleared');
    expect(starts[1]?.tick).toBe(firstCleared?.tick);
    expect(result.finalState.lives).toBe(START_LIVES - 3);
  });

  it('the same scenario run twice gives an identical event log', () => {
    const scenario = {
      towers: [{ kind: 'rifleNest', tile: { col: 2, row: 3 } }],
      autoStartWaves: true,
      until: 'end',
    } as const;
    const first = runScenario(scenario);
    expect(first.events.length).toBeGreaterThan(10);
    expect(runScenario(scenario).events).toEqual(first.events);
  });

  it('spawnEnemy puts an enemy on the Path outside any wave', () => {
    const { finalState } = runScenario({
      map: SMALL,
      script: [{ atTick: 0, command: { type: 'spawnEnemy', kind: 'infantry' } }],
      until: { ticks: 60 },
    });
    expect(finalState.enemies).toHaveLength(1);
    expect(finalState.enemies[0]?.distance).toBeCloseTo(1.5);
  });
});

describe('setUpGame', () => {
  it('with no setup, builds the MVP game in the Build phase', () => {
    const { state } = setUpGame();
    expect(state.map.id).toBe(MVP_MAP.id);
    expect(state.lives).toBe(START_LIVES);
    expect(state.money).toBe(START_MONEY);
    expect(state.phase).toBe('build');
    expect(state.towers).toEqual([]);
  });

  it('takes the setup of a scenario, its pre-placed towers free', () => {
    const { state } = setUpGame({
      map: SMALL,
      lives: 3,
      money: 7,
      towers: [{ kind: 'rifleNest', tile: { col: 1, row: 2 } }],
      waves: ONE_INFANTRY,
    });
    expect(state.map.id).toBe('small');
    expect(state.lives).toBe(3);
    expect(state.money).toBe(7);
    expect(state.towers.map((t) => t.tile)).toEqual([{ col: 1, row: 2 }]);
    expect(state.totalWaves).toBe(1);
  });

  it('throws for a pre-placed tower that cannot be placed', () => {
    expect(() => setUpGame({ map: SMALL, towers: [{ kind: 'rifleNest', tile: { col: 1, row: 1 } }] })).toThrow(
      /1,1.*notBuildable/,
    );
  });
});

import { describe, expect, it, vi } from 'vitest';
import { START_MONEY } from '../data/start';
import { TOWER_STATS } from '../data/towers';
import { TICK_MS } from '../sim/game';
import { setUpGame, type GameSetup } from '../sim/scenario';
import { createTestApi, type ScenarioLoaders, type TestHooks } from './api';

const BUILDABLE = { col: 1, row: 3 };
const ONE_INFANTRY: GameSetup = { waves: [{ kind: 'infantry', count: 1, spacingMs: 0 }] };

/** Hooks over a real game, as the Game scene gives them. */
function fakeHooks(setup: GameSetup = {}): TestHooks & { load: ReturnType<typeof vi.fn> } {
  const game = setUpGame(setup);
  return {
    game,
    step: (ticks) => {
      for (let i = 0; i < ticks; i++) game.tick(TICK_MS);
    },
    load: vi.fn(async () => {}),
  };
}

const api = (hooks: TestHooks, scenarios: ScenarioLoaders = {}) => createTestApi(hooks, scenarios);

describe('createTestApi', () => {
  it('state() is a plain copy of the game state without the map', () => {
    const hooks = fakeHooks();
    const state = api(hooks).state();
    expect(state).not.toHaveProperty('map');
    expect(state).toMatchObject({ phase: 'build', money: START_MONEY, waveNumber: 0, towers: [], enemies: [] });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('state() does not change when the game moves on', () => {
    const hooks = fakeHooks(ONE_INFANTRY);
    const testApi = api(hooks);
    hooks.game.startWave();
    const before = testApi.state();
    hooks.step(30);
    expect(before.timeMs).toBe(0);
    expect(before.enemies[0]?.distance).toBe(0);
  });

  it('command places a tower like a player and returns its id', () => {
    const testApi = api(fakeHooks());
    const result = testApi.command({ type: 'placeTower', kind: 'rifleNest', tile: BUILDABLE });
    expect(result).toEqual({ ok: true, towerId: expect.any(Number) });
    expect(testApi.state().money).toBe(START_MONEY - TOWER_STATS.rifleNest.cost);
  });

  it('command passes a refusal through', () => {
    const testApi = api(fakeHooks());
    const onPath = { col: 0, row: 2 };
    expect(testApi.command({ type: 'placeTower', kind: 'rifleNest', tile: onPath })).toEqual({
      ok: false,
      reason: 'notBuildable',
    });
  });

  it('step(n) runs n fixed ticks and returns the new state', () => {
    const testApi = api(fakeHooks());
    expect(testApi.step(60).timeMs).toBeCloseTo(60 * TICK_MS);
    expect(testApi.step(0).timeMs).toBeCloseTo(60 * TICK_MS);
  });

  it.each([-1, 2.5, Number.NaN])('step(%s) throws RangeError', (ticks) => {
    expect(() => api(fakeHooks()).step(ticks)).toThrow(RangeError);
  });

  it("loadScenario hands the named scenario's setup to the scene", async () => {
    const hooks = fakeHooks();
    await api(hooks, { 'one-infantry': async () => ONE_INFANTRY }).loadScenario('one-infantry');
    expect(hooks.load).toHaveBeenCalledWith(ONE_INFANTRY);
  });

  it('loadScenario rejects an unknown name and lists the known ones', async () => {
    const hooks = fakeHooks();
    const testApi = api(hooks, { a: async () => ({}), b: async () => ({}) });
    await expect(testApi.loadScenario('nope')).rejects.toThrow(/nope.*a, b/);
    expect(hooks.load).not.toHaveBeenCalled();
  });

  it('reads the game through the hooks each time, so it follows a restarted scene', () => {
    let game = setUpGame();
    const hooks: TestHooks = {
      get game() {
        return game;
      },
      step: () => {},
      load: async () => {},
    };
    const testApi = api(hooks);
    testApi.command({ type: 'placeTower', kind: 'rifleNest', tile: BUILDABLE });
    game = setUpGame();
    expect(testApi.state().towers).toEqual([]);
  });
});

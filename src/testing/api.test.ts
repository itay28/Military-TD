import { describe, expect, it, vi } from 'vitest';
import { START_MONEY } from '../data/start';
import { TOWER_STATS } from '../data/towers';
import { TICK_MS } from '../sim/game';
import { setUpGame, type GameSetup } from '../sim/scenario';
import { createTestApi, type ScenarioLoaders, type TestHooks, type TestView } from './api';

const BUILDABLE = { col: 1, row: 3 };
const ONE_INFANTRY: GameSetup = { waves: [{ groups: [{ kind: 'infantry', count: 1, spacingMs: 0, delayMs: 0 }] }] };

/** Hooks over a real game, as the Game scene gives them. */
function fakeHooks(setup: GameSetup = {}): TestHooks & { load: ReturnType<typeof vi.fn> } {
  const game = setUpGame(setup);
  return {
    game,
    step: (ticks) => {
      for (let i = 0; i < ticks; i++) game.tick(TICK_MS);
    },
    load: vi.fn(async () => {}),
    view: () => EMPTY_VIEW,
  };
}

const EMPTY_VIEW: TestView = {
  rangeRing: { visible: false, towerId: null, center: { x: 0, y: 0 } },
  rangeRings: [],
  tracers: [],
  effects: [],
  ghost: { visible: false, tile: null },
  camera: { scrollX: 0, scrollY: 0, zoom: 1 },
  drawOrder: ['map'],
  sprites: true,
  turrets: [],
};

const api = (hooks: TestHooks, scenarios: ScenarioLoaders = {}) => createTestApi(hooks, scenarios);

describe('createTestApi', () => {
  it('state() is a plain copy of the game state without the map', () => {
    const hooks = fakeHooks();
    const state = api(hooks).state();
    expect(state).not.toHaveProperty('map');
    expect(state).toMatchObject({ phase: 'build', money: START_MONEY, waveNumber: 0, towers: [], enemies: [] });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('state() names the map the game is on, by id', () => {
    expect(api(fakeHooks()).state().mapId).toBe('mvp');
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

  it('command upgrades a tower like a player and returns its new level', () => {
    const testApi = api(fakeHooks({ towers: [{ kind: 'rifleNest', tile: BUILDABLE }] }));
    const [tower] = testApi.state().towers;
    expect(testApi.command({ type: 'upgradeTower', towerId: tower!.id })).toEqual({ ok: true, level: 2 });
    expect(testApi.state()).toMatchObject({ money: START_MONEY - 40, towers: [{ level: 2 }] });
  });

  it('command starts selling a tower and returns the refund', () => {
    const testApi = api(fakeHooks({ towers: [{ kind: 'rifleNest', tile: BUILDABLE }] }));
    const [tower] = testApi.state().towers;
    expect(testApi.command({ type: 'sellTower', towerId: tower!.id })).toEqual({ ok: true, refund: 35 });
    expect(testApi.state().towers).toHaveLength(1);
    testApi.step(120);
    expect(testApi.state().towers).toEqual([]);
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
      view: () => EMPTY_VIEW,
    };
    const testApi = api(hooks);
    testApi.command({ type: 'placeTower', kind: 'rifleNest', tile: BUILDABLE });
    game = setUpGame();
    expect(testApi.state().towers).toEqual([]);
  });

  it("view() is a plain copy of the scene's view that later frames don't change", () => {
    const scene = {
      rangeRing: { visible: true, towerId: 1, center: { x: 72, y: 168 } },
      rangeRings: [1],
      tracers: [{ from: { x: 72, y: 168 }, to: { x: 24, y: 120 }, alpha: 1 }],
      effects: [{ kind: 'puff' as const, at: { x: 24, y: 120 }, progress: 0.5 }],
      ghost: { visible: true, tile: { col: 1, row: 2 } },
      camera: { scrollX: 10, scrollY: -20, zoom: 1.5 },
      drawOrder: ['map', 'towers', 'rangeRing'],
      sprites: true,
      turrets: [{ towerId: 1, angle: -Math.PI / 2 }],
    };
    const hooks = { ...fakeHooks(), view: () => scene };
    const view = api(hooks).view();
    expect(view).toEqual(scene);
    scene.rangeRing.visible = false;
    scene.tracers.length = 0;
    scene.turrets[0]!.angle = 0;
    expect(view.rangeRing.visible).toBe(true);
    expect(view.tracers).toHaveLength(1);
    expect(view.turrets[0]?.angle).toBe(-Math.PI / 2);
  });
});

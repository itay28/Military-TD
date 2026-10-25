import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/sim/scenario';
import { SCENARIO_DIR, scenarioNames, type ScenarioFile } from './define';

// Every named scenario, also runnable with `npm run scenario -- <name>`. Listed at run time, not with
// import.meta.glob: Vitest's module cache keeps an old glob result, so a new scenario file would be skipped.
const scenarios = await Promise.all(
  scenarioNames().map(async (name) => ({
    name,
    scenario: ((await import(`${SCENARIO_DIR}/${name}.scenario.ts`)) as { default: ScenarioFile }).default,
  })),
);

describe('named scenarios', () => {
  it('include the starter scenarios', () => {
    expect(scenarios.map((s) => s.name)).toEqual(
      expect.arrayContaining(['single-infantry-leaks', 'one-tower-kills-one-infantry', 'mvp-full-game']),
    );
  });

  describe.each(scenarios)('$name', ({ scenario }) => {
    it('has a description', () => {
      expect(scenario.description).not.toBe('');
    });

    it('meets its expectations', () => {
      scenario.expectations?.(runScenario(scenario), expect);
    });

    it('gives an identical event log when run twice', () => {
      expect(runScenario(scenario).events).toEqual(runScenario(scenario).events);
    });
  });

  // Wall-clock: a run takes a few ms, so 500 ms leaves a slow CI runner plenty of room.
  it('a full game runs in well under 1 s', () => {
    const full = scenarios.find((s) => s.name === 'mvp-full-game');
    if (!full) throw new Error('mvp-full-game scenario is missing');
    const start = performance.now();
    const result = runScenario(full.scenario);
    const elapsedMs = performance.now() - start;
    expect(['victory', 'defeat']).toContain(result.outcome);
    expect(elapsedMs).toBeLessThan(500);
  });
});

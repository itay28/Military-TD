import type { ExpectStatic } from 'vitest';
import type { Scenario, ScenarioResult } from '../../src/sim/scenario';

// No Node imports here: test mode bundles the scenario files into the game for `__TD__.loadScenario` (ADR-0003).

/** A named scenario file's default export: the scenario, what it shows, and what Vitest checks about its run. */
export interface ScenarioFile extends Scenario {
  /** One line, printed by `npm run scenario`. */
  readonly description: string;
  /** Assertions on the run. Vitest's `expect` comes in as a parameter so the CLI can load the file without Vitest. */
  readonly expectations?: (result: ScenarioResult, expect: ExpectStatic) => void;
}

export const defineScenario = (scenario: ScenarioFile): ScenarioFile => scenario;

import { readdirSync } from 'node:fs';
import type { ExpectStatic } from 'vitest';
import type { Scenario, ScenarioResult } from '../../src/sim/scenario';

/** A named scenario file's default export: the scenario, what it shows, and what Vitest checks about its run. */
export interface ScenarioFile extends Scenario {
  /** One line, printed by `npm run scenario`. */
  readonly description: string;
  /** Assertions on the run. Vitest's `expect` comes in as a parameter so the CLI can load the file without Vitest. */
  readonly expectations?: (result: ScenarioResult, expect: ExpectStatic) => void;
}

export const defineScenario = (scenario: ScenarioFile): ScenarioFile => scenario;

/** Where named scenarios live: `<name>.scenario.ts`. */
export const SCENARIO_DIR = import.meta.dirname;

/** The named scenarios, sorted. */
export function scenarioNames(): string[] {
  return readdirSync(SCENARIO_DIR)
    .filter((file) => file.endsWith('.scenario.ts'))
    .map((file) => file.slice(0, -'.scenario.ts'.length))
    .sort();
}

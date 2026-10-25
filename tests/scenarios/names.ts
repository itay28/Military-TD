import { readdirSync } from 'node:fs';

/** Where named scenarios live: `<name>.scenario.ts`. */
export const SCENARIO_DIR = import.meta.dirname;

/** The named scenarios, sorted. */
export function scenarioNames(): string[] {
  return readdirSync(SCENARIO_DIR)
    .filter((file) => file.endsWith('.scenario.ts'))
    .map((file) => file.slice(0, -'.scenario.ts'.length))
    .sort();
}

import type { ScenarioFile } from '../../tests/scenarios/define';
import type { ScenarioLoaders } from './api';

// The named scenarios, for `__TD__.loadScenario`. Each is its own chunk, loaded only when a test asks for it.
const files = import.meta.glob<ScenarioFile>('../../tests/scenarios/*.scenario.ts', { import: 'default' });

export const SCENARIOS: ScenarioLoaders = Object.fromEntries(
  Object.entries(files).map(([path, load]) => [path.slice(path.lastIndexOf('/') + 1, -'.scenario.ts'.length), load]),
);

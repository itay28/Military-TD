import { join } from 'node:path';
import { runnerImport } from 'vite';
import type { ScenarioEvent, ScenarioResult, runScenario as RunScenario } from '../src/sim/scenario.ts';
import type { ScenarioFile, scenarioNames as ScenarioNames } from '../tests/scenarios/define.ts';

// Runs a named scenario headlessly so an agent can inspect a game without a browser (ADR-0003):
//   npm run scenario -- <name> [--json]
// The sim and scenario files load through Vite, which resolves their extensionless imports.

const ROOT = join(import.meta.dirname, '..');
const USAGE = 'Usage: npm run scenario -- <name> [--json]   (npm run -s for JSON without npm’s header)';

async function load<T>(path: string): Promise<T> {
  return (await runnerImport<T>(join(ROOT, path), { configFile: false, logLevel: 'error' })).module;
}

/** One line per event; an enemy shows as `kind#id` instead of its whole state. */
function describeEvent(event: ScenarioEvent): string {
  const { tick, type, ...rest } = event;
  const at = String(tick).padStart(6);
  if (event.type === 'command') {
    const { type: command, ...args } = event.command;
    const result = event.result.ok ? 'ok' : `refused: ${event.result.reason}`;
    return `${at}  command ${command} ${Object.keys(args).length ? JSON.stringify(args) + ' ' : ''}→ ${result}`;
  }
  const details = Object.entries(rest).map(([key, value]) => {
    if (key === 'enemy' && value && typeof value === 'object' && 'kind' in value && 'id' in value)
      return `enemy=${String(value.kind)}#${String(value.id)}`;
    return `${key}=${JSON.stringify(value)}`;
  });
  return `${at}  ${type} ${details.join(' ')}`;
}

function summary(name: string, scenario: ScenarioFile, result: ScenarioResult, tickMs: number): string {
  const { outcome, ticks, finalState: state, events } = result;
  const counts = new Map<string, number>();
  for (const { type } of events) counts.set(type, (counts.get(type) ?? 0) + 1);
  const width = Math.max(0, ...[...counts.keys()].map((type) => type.length));
  return [
    `Scenario: ${name}`,
    `  ${scenario.description}`,
    `Outcome: ${outcome} after ${ticks} ticks (${((ticks * tickMs) / 1000).toFixed(1)} s of game time)`,
    `Lives: ${state.lives}   Money: ${state.money}   Wave: ${state.waveNumber}/${state.totalWaves}   Towers: ${state.towers.length}   Enemies left: ${state.enemies.length}`,
    'Events:',
    ...[...counts].map(([type, count]) => `  ${type.padEnd(width)}  ${count}`),
    'Timeline (tick, without towerFired):',
    ...events.filter((e) => e.type !== 'towerFired').map(describeEvent),
  ].join('\n');
}

async function main(args: string[]): Promise<number> {
  const json = args.includes('--json');
  const [name, ...extra] = args.filter((arg) => arg !== '--json');
  if (!name || extra.length > 0) {
    console.error(USAGE);
    return 1;
  }
  const { scenarioNames } = await load<{ scenarioNames: typeof ScenarioNames }>('tests/scenarios/define.ts');
  const names = scenarioNames();
  if (!names.includes(name)) {
    console.error(`No scenario named "${name}". There are:\n${names.map((n) => `  ${n}`).join('\n')}\n${USAGE}`);
    return 1;
  }
  const { runScenario } = await load<{ runScenario: typeof RunScenario }>('src/sim/scenario.ts');
  const { TICK_MS } = await load<{ TICK_MS: number }>('src/sim/game.ts');
  const scenario = (await load<{ default: ScenarioFile }>(`tests/scenarios/${name}.scenario.ts`)).default;
  const result = runScenario(scenario);
  if (json) {
    const finalState = { ...result.finalState, map: result.finalState.map.id };
    console.log(JSON.stringify({ name, ...result, finalState }, null, 2));
  } else {
    console.log(summary(name, scenario, result, TICK_MS));
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));

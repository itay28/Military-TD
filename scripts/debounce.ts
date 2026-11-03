// The gate in front of Board sync's and PR steward's sweeps (#293, #417). A burst of events (a
// relabel, an agent's pushes, CI and the review finishing) should end in one sweep, since each
// sweep spends the maintainer's PROJECT_TOKEN quota. The gate used to sleep 60 s in a concurrency
// group where a newer event cancelled it, and GitHub shows a cancelled run as a red ✗ next to the
// PR's green checks. Now nothing is cancelled and there's no fixed wait:
//
// - a newer run that will sweep covers this event (it reads the board after it happened): yield;
// - an older run still active is sweeping (queue behind it) or about to see this run and yield, or a
//   newer run hasn't shown yet whether its event passed the filter: wait;
// - otherwise: go at once.
//
// A lone event sweeps as soon as its runner starts; a burst ends in the sweep already running plus
// one more. Runs are compared by run number within one workflow. Writes `go=true|false` to
// GITHUB_OUTPUT. Uses GITHUB_TOKEN (`actions: read`), whose quota is separate from PROJECT_TOKEN's.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Another run of the same workflow, as the gate sees it. */
export interface OtherRun {
  readonly runNumber: number;
  /** Not completed yet (queued, waiting or in progress). */
  readonly active: boolean;
  /** Its debounce job: passed or running, skipped (its event was filtered out), or not created yet. */
  readonly gate: 'passed' | 'skipped' | 'unknown';
}

export type DebounceStep = 'go' | 'yield' | 'wait';

/** What the run numbered `me` does now, given the workflow's other runs. */
export function debounceStep(me: number, others: readonly OtherRun[]): DebounceStep {
  const active = others.filter((r) => r.active);
  if (active.some((r) => r.runNumber > me && r.gate === 'passed')) return 'yield';
  if (active.some((r) => r.runNumber < me || r.gate === 'unknown')) return 'wait';
  return 'go';
}

const POLL_MS = 10_000;
/** After this long the gate goes anyway; the sweep's own concurrency group still keeps runs apart. */
const MAX_WAIT_MS = 20 * 60_000;

interface ApiRun {
  id: number;
  run_number: number;
  status: string;
}
interface ApiJob {
  name: string;
  conclusion: string | null;
}

async function api<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${process.env['GITHUB_REPOSITORY']}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** The workflow's other runs that matter: active ones, each newer one with its gate's state. */
async function otherRuns(workflowId: number, me: number, token: string): Promise<OtherRun[]> {
  const { workflow_runs } = await api<{ workflow_runs: ApiRun[] }>(
    `actions/workflows/${workflowId}/runs?per_page=50`,
    token,
  );
  const active = workflow_runs.filter((r) => r.run_number !== me && r.status !== 'completed');
  return Promise.all(
    active.map(async (r): Promise<OtherRun> => {
      if (r.run_number < me) return { runNumber: r.run_number, active: true, gate: 'passed' };
      const { jobs } = await api<{ jobs: ApiJob[] }>(`actions/runs/${r.id}/jobs`, token);
      const gate = jobs.find((j) => j.name === 'debounce');
      return {
        runNumber: r.run_number,
        active: true,
        gate: !gate ? 'unknown' : gate.conclusion === 'skipped' ? 'skipped' : 'passed',
      };
    }),
  );
}

async function main(): Promise<void> {
  const token = process.env['GITHUB_TOKEN'] ?? '';
  const runId = process.env['GITHUB_RUN_ID'];
  const me = Number(process.env['GITHUB_RUN_NUMBER']);
  let go = true;
  try {
    const { workflow_id } = await api<{ workflow_id: number }>(`actions/runs/${runId}`, token);
    const started = Date.now();
    for (;;) {
      const step = debounceStep(me, await otherRuns(workflow_id, me, token));
      if (step === 'yield') {
        console.log('A newer run will sweep after this event: skipping this one.');
        go = false;
        break;
      }
      if (step === 'go') break;
      if (Date.now() - started > MAX_WAIT_MS) {
        console.log(`::warning::Still waiting on an older run after ${MAX_WAIT_MS / 60_000} min: going anyway.`);
        break;
      }
      console.log('An older run is still active: waiting for it.');
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  } catch (error) {
    console.log(`::warning::Debounce couldn't read the workflow's runs, so this run sweeps: ${String(error)}`);
  }
  console.log(`go=${go}`);
  if (process.env['GITHUB_OUTPUT']) appendFileSync(process.env['GITHUB_OUTPUT'], `go=${go}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

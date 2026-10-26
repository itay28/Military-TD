import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { send, type Push } from './notify.ts';

// Turns a failed CI run on main, a failed release or a failed deploy into an issue (#207,
// docs/agents/issue-tracker.md → Hand-off). The decisions and texts are pure functions; the CLI at the bottom
// only fetches and writes.

/** The part of a finished `workflow_run` this reads. */
export interface Run {
  workflow: string;
  conclusion: string | null;
  /** The run's head branch; for a Deploy run started by hand on a tag, the tag. */
  branch: string;
  url: string;
  sha: string;
  commitTitle: string;
  failedJobs: string[];
}

/** An open issue holding a workflow's failure report. */
export interface Report {
  number: number;
}

export type Decision = { action: 'open' } | { action: 'comment'; issue: number; kind: 'failure' | 'green' };

/** Hidden in the report's body so the next run of the same workflow finds it. */
export const markerFor = (workflow: string): string => `<!-- failure-report:${workflow} -->`;

/** CI and Release are watched on main only; a Deploy runs for a tag, so any ref. */
function watched(run: Run): boolean {
  if (run.workflow === 'Deploy') return true;
  return (run.workflow === 'CI' || run.workflow === 'Release') && run.branch === 'main';
}

export function decide(run: Run, open: Report | null): Decision | null {
  if (!watched(run)) return null;
  if (run.conclusion === 'failure') {
    return open ? { action: 'comment', issue: open.number, kind: 'failure' } : { action: 'open' };
  }
  if (run.conclusion === 'success' && open) return { action: 'comment', issue: open.number, kind: 'green' };
  return null;
}

export const issueTitle = (run: Run): string =>
  run.workflow === 'Deploy' ? `fix: Deploy failing for ${run.branch}` : `fix: ${run.workflow} failing on main`;

const runLine = (run: Run): string => {
  const jobs = run.failedJobs.length ? run.failedJobs.map((j) => `\`${j}\``).join(', ') : 'none listed';
  return `- Run: ${run.url}\n- Failed jobs: ${jobs}\n- Head commit: \`${run.sha.slice(0, 7)}\` ${run.commitTitle}`;
};

export const issueBody = (run: Run): string =>
  `The **${run.workflow}** workflow failed${run.workflow === 'Deploy' ? ` for \`${run.branch}\`` : ' on `main`'}.\n\n${runLine(run)}\n\n` +
  `Filed by the *Failure report* Action (#207). Later failures are added here as comments, and a green run says so; the fixing PR closes this issue.\n\n${markerFor(run.workflow)}`;

export const commentFor = (run: Run, kind: 'failure' | 'green'): string =>
  kind === 'green'
    ? `**${run.workflow}** is green again: ${run.url}\n\nThe fixing PR closes this issue.`
    : `**${run.workflow}** failed again.\n\n${runLine(run)}`;

export function pushFor(run: Run, issue: { number: number; url: string }): Push {
  return {
    title: `${run.workflow} failing: issue #${issue.number}`,
    body: `${issueTitle(run)}\n${run.commitTitle}`,
    click: issue.url,
  };
}

export interface Milestone {
  number: number;
  title: string;
  state: string;
  due_on: string | null;
}

/** The open milestone due first (undated ones last), then by title: the one the team is working on. */
export function currentMilestone(milestones: Milestone[]): number | null {
  const open = milestones.filter((m) => m.state === 'open');
  open.sort((a, b) => (a.due_on ?? '9').localeCompare(b.due_on ?? '9') || a.title.localeCompare(b.title));
  return open[0]?.number ?? null;
}

// --- CLI -------------------------------------------------------------------
// `node scripts/failure-report.ts`: run by .github/workflows/failure-report.yml on a `workflow_run` event.

const API = 'https://api.github.com';
const repoPath = process.env['GITHUB_REPOSITORY'] ?? 'itay28/Military-TD';
const INFRA_EPIC = 24;

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) throw new Error('GITHUB_TOKEN is not set.');
  const res = await fetch(`${API}/repos/${repoPath}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface ApiIssue {
  id: number;
  number: number;
  html_url: string;
}

interface WorkflowRun {
  name: string;
  conclusion: string | null;
  head_branch: string;
  html_url: string;
  head_sha: string;
  head_commit?: { message?: string } | null;
  id: number;
}

async function toRun(event: WorkflowRun): Promise<Run> {
  const jobs = await api<{ jobs: { name: string; conclusion: string | null }[] }>(
    'GET',
    `/actions/runs/${event.id}/jobs?per_page=100`,
  );
  return {
    workflow: event.name,
    conclusion: event.conclusion,
    branch: event.head_branch,
    url: event.html_url,
    sha: event.head_sha,
    commitTitle: (event.head_commit?.message ?? '').split('\n')[0] ?? '',
    failedJobs: jobs.jobs.filter((j) => j.conclusion === 'failure').map((j) => j.name),
  };
}

/** The open report for a workflow: an open issue whose body has its marker. */
async function findReport(workflow: string): Promise<Report | null> {
  const issues = await api<{ number: number; body?: string | null; pull_request?: unknown }[]>(
    'GET',
    '/issues?state=open&labels=area:infra,bug&per_page=100',
  );
  const found = issues.find((i) => !i.pull_request && i.body?.includes(markerFor(workflow)));
  return found ? { number: found.number } : null;
}

async function open(run: Run): Promise<{ number: number; url: string }> {
  const milestone = currentMilestone(await api<Milestone[]>('GET', '/milestones?state=open&per_page=100'));
  const issue = await api<ApiIssue>('POST', '/issues', {
    title: issueTitle(run),
    body: issueBody(run),
    labels: ['bug', 'needs-triage', 'area:infra'],
    ...(milestone ? { milestone } : {}),
  });
  await api('POST', `/issues/${INFRA_EPIC}/sub_issues`, { sub_issue_id: issue.id });
  return { number: issue.number, url: issue.html_url };
}

async function main(): Promise<void> {
  const path = process.env['GITHUB_EVENT_PATH'];
  if (!path) throw new Error('GITHUB_EVENT_PATH is not set.');
  const event = (JSON.parse(readFileSync(path, 'utf8')) as { workflow_run: WorkflowRun }).workflow_run;
  const run = await toRun(event);
  const decision = decide(run, run.conclusion === 'cancelled' ? null : await findReport(run.workflow));
  if (!decision) {
    console.log(`Nothing to report for ${run.workflow} (${run.conclusion}) on ${run.branch}.`);
    return;
  }
  if (decision.action === 'comment') {
    await api('POST', `/issues/${decision.issue}/comments`, { body: commentFor(run, decision.kind) });
    console.log(`Commented on #${decision.issue}.`);
    return;
  }
  const issue = await open(run);
  console.log(`Opened #${issue.number}.`);
  // Labels set with GITHUB_TOKEN don't start notify.yml, so push from here.
  await send(process.env['NTFY_TOPIC'], pushFor(run, issue));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

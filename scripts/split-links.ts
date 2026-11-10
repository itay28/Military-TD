import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { send } from './notify.ts';

// Links the parts of a split issue (#488). The split agent (docs/agents/prompts/split.md) only writes
// split-plan.json; this plain step in .github/workflows/split-issue.yml adds each part under the epic and
// chains "blocked by" in order, then reads the links back. Its own `gh api` calls were denied at random by
// the CI allowlist, which left parts unlinked. Idempotent: a re-run never adds a link twice.

export interface SplitPlan {
  /** The issue that was split. */
  original: number;
  /** The original's parent epic, or null when it had none. */
  epic: number | null;
  /** The new parts, in the order they're built: each one after the first is blocked by the one before. */
  parts: number[];
}

/** The GitHub calls the linker needs; issues by number, link targets by issue id. */
export interface LinkApi {
  issueId(issue: number): Promise<number>;
  /** Numbers of the epic's sub-issues. */
  subIssues(epic: number): Promise<number[]>;
  addSubIssue(epic: number, subIssueId: number): Promise<void>;
  /** Numbers of the issues blocking this one. */
  blockedBy(issue: number): Promise<number[]>;
  addBlockedBy(issue: number, blockerId: number): Promise<void>;
}

export interface Problem {
  issue: number;
  message: string;
}

export interface LinkResult {
  added: string[];
  problems: Problem[];
}

const isIssue = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** Reads split-plan.json, throwing on anything but 2–4 distinct parts that aren't the original. */
export function parsePlan(text: string): SplitPlan {
  const raw = JSON.parse(text) as Partial<Record<keyof SplitPlan, unknown>>;
  const { original, epic, parts } = raw;
  if (!isIssue(original)) throw new Error('split plan: "original" must be an issue number');
  if (epic !== null && !isIssue(epic)) throw new Error('split plan: "epic" must be an issue number or null');
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 4 || !parts.every(isIssue))
    throw new Error('split plan: "parts" must list 2–4 issue numbers');
  if (new Set(parts).size !== parts.length || parts.includes(original))
    throw new Error('split plan: "parts" must be distinct new issues');
  return { original, epic, parts };
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What each part should be linked to: under the epic, and blocked by the part before it. */
const wanted = (plan: SplitPlan, i: number) => ({
  issue: plan.parts[i] as number,
  blocker: i > 0 ? (plan.parts[i - 1] as number) : null,
});

/** Adds the missing links, then reads them all back; never throws on an API error, it reports it. */
export async function linkParts(plan: SplitPlan, api: LinkApi): Promise<LinkResult> {
  const added: string[] = [];
  const failures = new Map<number, string[]>();
  const fail = (issue: number, message: string) => failures.set(issue, [...(failures.get(issue) ?? []), message]);

  for (const i of plan.parts.keys()) {
    const { issue } = wanted(plan, i);
    if (plan.epic === null) continue;
    try {
      if (!(await api.subIssues(plan.epic)).includes(issue)) {
        await api.addSubIssue(plan.epic, await api.issueId(issue));
        added.push(`#${issue} under #${plan.epic}`);
      }
    } catch (error) {
      fail(issue, `adding it under #${plan.epic} failed: ${reason(error)}`);
    }
  }
  for (const i of plan.parts.keys()) {
    const { issue, blocker } = wanted(plan, i);
    if (blocker === null) continue;
    try {
      if (!(await api.blockedBy(issue)).includes(blocker)) {
        await api.addBlockedBy(issue, await api.issueId(blocker));
        added.push(`#${issue} blocked by #${blocker}`);
      }
    } catch (error) {
      fail(issue, `marking it blocked by #${blocker} failed: ${reason(error)}`);
    }
  }

  // Read back: the links are what counts, not the calls' answers.
  const children = plan.epic === null ? [] : await api.subIssues(plan.epic).catch((e: unknown) => e);
  for (const i of plan.parts.keys()) {
    const { issue, blocker } = wanted(plan, i);
    if (plan.epic !== null) {
      if (!Array.isArray(children)) fail(issue, `reading #${plan.epic}'s sub-issues failed: ${reason(children)}`);
      else if (!children.includes(issue)) fail(issue, `not under #${plan.epic}`);
    }
    if (blocker === null) continue;
    try {
      if (!(await api.blockedBy(issue)).includes(blocker)) fail(issue, `not blocked by #${blocker}`);
    } catch (error) {
      fail(issue, `reading what blocks it failed: ${reason(error)}`);
    }
  }

  const problems = plan.parts
    .filter((issue) => failures.has(issue))
    .map((issue) => ({ issue, message: (failures.get(issue) ?? []).join('; ') }));
  return { added, problems };
}

/** The hand-off comment on a part (or the original) the step couldn't link. */
export const failureComment = (plan: SplitPlan, problem: Problem, runUrl: string): string =>
  [
    `The split of #${plan.original} couldn't link #${problem.issue}: ${problem.message}.`,
    '',
    `Run: ${runUrl}. Link it by hand (under the epic, blocked by the part before it) and remove \`needs-you\`, or re-run the workflow: it only adds what's missing.`,
    '',
    '_Generated by [Claude Code](https://claude.ai/code)_',
  ].join('\n');

// --- CLI -------------------------------------------------------------------
// `node scripts/split-links.ts split-plan.json`, with GITHUB_TOKEN (and NTFY_TOPIC to push a failure).

const API = 'https://api.github.com';
const repoPath = process.env['GITHUB_REPOSITORY'] ?? 'itay28/Military-TD';

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) throw new Error('GITHUB_TOKEN is not set.');
  const res = await fetch(`${API}/repos/${repoPath}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const numbers = (issues: { number: number }[]): number[] => issues.map((i) => i.number);

export const restApi: LinkApi = {
  issueId: async (issue) => (await api<{ id: number }>('GET', `/issues/${issue}`)).id,
  subIssues: async (epic) => numbers(await api('GET', `/issues/${epic}/sub_issues?per_page=100`)),
  addSubIssue: async (epic, id) => void (await api('POST', `/issues/${epic}/sub_issues`, { sub_issue_id: id })),
  blockedBy: async (issue) => numbers(await api('GET', `/issues/${issue}/dependencies/blocked_by?per_page=100`)),
  addBlockedBy: async (issue, id) =>
    void (await api('POST', `/issues/${issue}/dependencies/blocked_by`, { issue_id: id })),
};

/** Comments on the issue and labels it `needs-you`. */
async function handOff(plan: SplitPlan, problem: Problem, runUrl: string): Promise<void> {
  await api('POST', `/issues/${problem.issue}/comments`, { body: failureComment(plan, problem, runUrl) });
  await api('POST', `/issues/${problem.issue}/labels`, { labels: ['needs-you'] });
}

/** One push for the run, since a label set with GITHUB_TOKEN doesn't start notify.yml. */
const push = (plan: SplitPlan, problems: Problem[]): Promise<void> =>
  send(process.env['NTFY_TOPIC'], {
    title: `Split of #${plan.original}: ${problems.map((p) => `#${p.issue}`).join(', ')} not linked`,
    body: problems.map((p) => `#${p.issue}: ${p.message}`).join('\n'),
    click: `https://github.com/${repoPath}/issues/${problems[0]?.issue ?? plan.original}`,
  });

/** The plan's `original`, when the file at least names one. */
function originalOf(text: string): number | null {
  try {
    const { original } = JSON.parse(text) as { original?: unknown };
    return isIssue(original) ? original : null;
  } catch {
    return null;
  }
}

async function main(file: string): Promise<void> {
  const runUrl = `${process.env['GITHUB_SERVER_URL'] ?? 'https://github.com'}/${repoPath}/actions/runs/${process.env['GITHUB_RUN_ID'] ?? ''}`;
  const text = readFileSync(file, 'utf8');
  let plan: SplitPlan;
  try {
    plan = parsePlan(text);
  } catch (error) {
    // Hand the original over when the plan at least names it.
    const original = originalOf(text);
    if (original !== null) {
      const stub = { original, epic: null, parts: [] };
      const problem = { issue: original, message: `the split plan is invalid (${reason(error)})` };
      await handOff(stub, problem, runUrl);
      await push(stub, [problem]);
    }
    throw error;
  }
  const { added, problems } = await linkParts(plan, restApi);
  console.log(added.length ? `Linked: ${added.join(', ')}.` : 'Every link was already there.');
  for (const problem of problems) {
    console.log(`::error::#${problem.issue}: ${problem.message}`);
    await handOff(plan, problem, runUrl);
  }
  if (problems.length) {
    await push(plan, problems);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2] ?? 'split-plan.json').catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

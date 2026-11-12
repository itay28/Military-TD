import { classifyFireError, github, NEEDS_YOU_LABEL, SPLIT_LABEL, type Fetch } from './auto-start.ts';

// Split retry (#486, docs/agents/issue-tracker.md → Auto-start): a *Split issue* run that fails (a usage
// limit, say) leaves its `needs-split` issue claimed, with nothing to run it again. Board sync dispatches
// it again a few at a time, and after MAX_SPLIT_ATTEMPTS failed runs hands the issue to the maintainer.
// The decisions are pure; readSplitIssues, retrySplit and giveUpSplit are the only calls with side
// effects, and take `fetch` so tests can mock it. Run from scripts/board-sync.ts.

const WORKFLOW = 'split-issue.yml';
/** At most this many *Split issue* dispatches per Board sync run, like the sizing backfill. */
export const MAX_SPLIT_RETRIES = 3;
/** Failed split runs (since the label went on) before the issue goes to the maintainer. */
export const MAX_SPLIT_ATTEMPTS = 2;
/** The last attempt must be this old before a split is dispatched again. */
export const SPLIT_RETRY_IDLE_MS = 60 * 60 * 1000;
/** The run name `.github/workflows/split-issue.yml` sets: the runs API doesn't return dispatch inputs. */
const RUN_NAME = /^Split issue #(\d+)$/;

/** A *Split issue* run for one issue. */
export interface SplitRun {
  readonly status: string;
  readonly conclusion: string | null;
  readonly createdAt: string;
  readonly url: string;
}

/** An open `needs-split` issue, with its split runs. */
export interface SplitIssue {
  readonly number: number;
  readonly hold: boolean;
  readonly needsYou: boolean;
  /** When `needs-split` last went on; runs from before it are ignored. */
  readonly labelledAt: string;
  readonly runs: readonly SplitRun[];
}

export interface SplitGiveUp {
  readonly issue: number;
  /** The failed runs' links, for the hand-off comment. */
  readonly failed: readonly string[];
}

export interface SplitPlan {
  readonly retry: number[];
  readonly giveUp: SplitGiveUp[];
}

/** Conclusions that are no attempt: the labeled event fired for another label, or nothing to do. */
const NOT_AN_ATTEMPT = ['skipped', 'neutral'];

/**
 * What to do about each `needs-split` issue (no `hold`, no `needs-you`), counting its runs since the
 * label went on (skipped ones aside). A successful or unfinished run: nothing. MAX_SPLIT_ATTEMPTS failed
 * runs: give up. Otherwise, once the last attempt (the label, or the latest run) is `idleMs` old: dispatch
 * again, at most MAX_SPLIT_RETRIES per run, lowest number first.
 */
export function planSplitRetries(issues: readonly SplitIssue[], now: number, idleMs = SPLIT_RETRY_IDLE_MS): SplitPlan {
  const retry: number[] = [];
  const giveUp: SplitGiveUp[] = [];
  for (const i of [...issues].sort((a, b) => a.number - b.number)) {
    if (i.hold || i.needsYou) continue;
    const since = Date.parse(i.labelledAt);
    const runs = i.runs.filter((r) => Date.parse(r.createdAt) >= since && !NOT_AN_ATTEMPT.includes(r.conclusion ?? ''));
    if (runs.some((r) => r.status !== 'completed' || r.conclusion === 'success')) continue;
    if (runs.length >= MAX_SPLIT_ATTEMPTS) {
      giveUp.push({ issue: i.number, failed: runs.map((r) => r.url) });
      continue;
    }
    const last = Math.max(since, ...runs.map((r) => Date.parse(r.createdAt)));
    if (!Number.isNaN(last) && now - last >= idleMs) retry.push(i.number);
  }
  return { retry: retry.slice(0, MAX_SPLIT_RETRIES), giveUp };
}

/** The issue a *Split issue* run is for, from its run name. */
export function splitRunIssue(displayTitle: string): number | undefined {
  const match = RUN_NAME.exec(displayTitle);
  return match ? Number(match[1]) : undefined;
}

/** A workflow run as the REST API returns it, with the fields read here. */
export interface WorkflowRun {
  readonly display_title: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly created_at: string;
  readonly html_url: string;
}

/** The *Split issue* runs grouped by issue; runs without an issue in their name are left out. */
export function splitRunsByIssue(runs: readonly WorkflowRun[]): Map<number, SplitRun[]> {
  const byIssue = new Map<number, SplitRun[]>();
  for (const r of runs) {
    const issue = splitRunIssue(r.display_title);
    if (issue === undefined) continue;
    const run = { status: r.status, conclusion: r.conclusion, createdAt: r.created_at, url: r.html_url };
    byIssue.set(issue, [...(byIssue.get(issue) ?? []), run]);
  }
  return byIssue;
}

/** An issue event as the REST API returns it, with the fields read here. */
export interface IssueEvent {
  readonly event: string;
  readonly label?: { readonly name: string };
  readonly created_at: string;
}

/** When `needs-split` last went on, from the issue's events. */
export function labelledAt(events: readonly IssueEvent[]): string | undefined {
  return events.findLast((e) => e.event === 'labeled' && e.label?.name === SPLIT_LABEL)?.created_at;
}

/** At most this many pages of runs: every `labeled` event on any issue makes a (skipped) *Split issue* run. */
const MAX_RUN_PAGES = 5;

/**
 * Read what planSplitRetries needs: for each issue, when `needs-split` went on (an issue whose label event
 * isn't found is left out), then the *Split issue* runs created since the earliest of those.
 */
export async function readSplitIssues(
  issues: readonly { number: number; hold: boolean; needsYou: boolean }[],
  token: string,
  fetchFn: Fetch = fetch,
): Promise<SplitIssue[]> {
  const labelled: ((typeof issues)[number] & { labelledAt: string })[] = [];
  for (const i of issues) {
    // Events come oldest first; a `needs-split` issue is young, so the first 100 hold the label.
    const events = (await (
      await github(fetchFn, token, 'GET', `issues/${i.number}/events?per_page=100`)
    ).json()) as IssueEvent[];
    const at = labelledAt(events);
    if (at !== undefined) labelled.push({ ...i, labelledAt: at });
  }
  if (!labelled.length) return [];
  const since = labelled.map((i) => i.labelledAt).sort()[0]!;
  const all: WorkflowRun[] = [];
  for (let page = 1; page <= MAX_RUN_PAGES; page++) {
    const query = `created=${encodeURIComponent(`>=${since}`)}&per_page=100&page=${page}`;
    const { workflow_runs } = (await (
      await github(fetchFn, token, 'GET', `actions/workflows/${WORKFLOW}/runs?${query}`)
    ).json()) as { workflow_runs: WorkflowRun[] };
    all.push(...workflow_runs);
    if (workflow_runs.length < 100) break;
  }
  const runs = splitRunsByIssue(all);
  return labelled.map((i) => ({ ...i, runs: runs.get(i.number) ?? [] }));
}

/**
 * Dispatch *Split issue* for an issue again. A temporary refusal (rate limit, server error, no answer)
 * returns `later`, quietly: the next run tries again. Anything else throws.
 */
export async function retrySplit(
  issue: number,
  token: string,
  ref: string,
  fetchFn: Fetch = fetch,
): Promise<'started' | 'later'> {
  try {
    await github(fetchFn, token, 'POST', `actions/workflows/${WORKFLOW}/dispatches`, {
      ref,
      inputs: { issue: String(issue) },
    });
  } catch (error) {
    if (classifyFireError(error) === 'temporary') return 'later';
    throw error;
  }
  return 'started';
}

/**
 * Hand a split that failed MAX_SPLIT_ATTEMPTS times to the maintainer: a comment linking the failed runs,
 * then `needs-you` (which pushes) on and `needs-split` off, as the split agent does when it can't split.
 */
export async function giveUpSplit(giveUp: SplitGiveUp, token: string, fetchFn: Fetch = fetch): Promise<void> {
  // needs-you first: it stops the next run from handing the issue over again if a later call fails.
  await github(fetchFn, token, 'POST', `issues/${giveUp.issue}/labels`, { labels: [NEEDS_YOU_LABEL] });
  const runs = giveUp.failed.map((url) => `- ${url}`).join('\n');
  await github(fetchFn, token, 'POST', `issues/${giveUp.issue}/comments`, {
    body:
      `The split agent failed ${giveUp.failed.length} times on this issue, so Board sync hands it to you:\n\n${runs}\n\n` +
      `Split it yourself, or re-run *Split issue* (\`gh workflow run ${WORKFLOW} -f issue=${giveUp.issue}\`), ` +
      `then remove \`${NEEDS_YOU_LABEL}\`.`,
  });
  await github(fetchFn, token, 'DELETE', `issues/${giveUp.issue}/labels/${SPLIT_LABEL}`);
}

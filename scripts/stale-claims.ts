import { AUTO_AGENT_LABEL, github, HOLD_LABEL, NEEDS_INFO_LABEL, NEEDS_YOU_LABEL, type Fetch } from './auto-start.ts';

// Stale manual claims (#489): an issue assigned by hand, with no PR and no activity, sits In progress
// forever (no `auto-agent` label, so the dead-session retry ignores it; auto-start skips assigned
// issues). Board sync flags each one once, with a comment and `needs-you`. The decision is pure; the
// rest is one batched query and the comment.

/** Hidden in the flag comment, so an issue is flagged once. */
export const STALE_MARKER = '<!-- stale-claim -->';
/** Assigned this long without a PR or any activity is stale. */
export const STALE_MS = 3 * 24 * 60 * 60 * 1000;

/** An open, assigned issue, with what the staleness check reads. */
export interface StaleIssue {
  readonly number: number;
  readonly assigned: boolean;
  readonly labels: readonly string[];
  readonly tracker: boolean;
  readonly milestone: number | null;
  /** `area:infra`: in scope without a milestone. */
  readonly infra: boolean;
  /** An open PR closes it. */
  readonly hasPr: boolean;
  /** Its latest comments. */
  readonly comments: readonly { readonly body: string; readonly createdAt: string }[];
  /** Other times that count as activity: the issue's last update, commits on its branches. */
  readonly activity: readonly string[];
}

/**
 * The issues to flag: assigned by hand (never `auto-agent`: the retry covers those), in the current or
 * next milestone (`scope`) or milestone-less infra, with no open PR, not already waiting on the
 * maintainer (`needs-you`, `needs-info`, `hold`), not flagged before, and quiet for STALE_MS.
 */
export function planStaleClaims(
  issues: readonly StaleIssue[],
  scope: readonly number[],
  now: number,
  idleMs = STALE_MS,
): number[] {
  return issues
    .filter((i) => {
      if (!i.assigned || i.tracker || i.hasPr) return false;
      if (i.labels.some((l) => [AUTO_AGENT_LABEL, HOLD_LABEL, NEEDS_YOU_LABEL, NEEDS_INFO_LABEL].includes(l)))
        return false;
      if (!(i.milestone === null ? i.infra : scope.includes(i.milestone))) return false;
      if (i.comments.some((c) => c.body.includes(STALE_MARKER))) return false;
      const last = Math.max(...i.activity.map(Date.parse), ...i.comments.map((c) => Date.parse(c.createdAt)));
      return now - last >= idleMs;
    })
    .map((i) => i.number);
}

/** One query for every candidate: each issue's update time, comments and branches `<type>/<n>-…` as `i<k>`. */
export function staleQuery(numbers: readonly number[]): string {
  const parts = numbers.map(
    (n, k) =>
      `i${k}: issue(number: ${n}) { updatedAt comments(last: 100) { nodes { body createdAt } } ` +
      `refs(refPrefix: "refs/heads/", query: "${n}-", first: 10) { nodes { name target { ... on Commit { committedDate } } } } }`,
  );
  return `query($owner: String!, $name: String!) {\n  repository(owner: $owner, name: $name) {\n    ${parts.join('\n    ')}\n  }\n}`;
}

interface StaleNode {
  updatedAt: string;
  comments: { nodes: { body: string; createdAt: string }[] };
  refs: { nodes: { name: string; target?: { committedDate?: string } | null }[] };
}

/** The `k`th candidate's comments and activity times from a `staleQuery` answer, for issue `number`. */
export function readStale(
  repository: Record<string, StaleNode | null | undefined>,
  k: number,
  number: number,
): { comments: { body: string; createdAt: string }[]; activity: string[] } {
  const node = repository[`i${k}`];
  if (!node) return { comments: [], activity: [] };
  const own = new RegExp(`(^|/)${number}-`);
  return {
    comments: node.comments.nodes,
    activity: [
      node.updatedAt,
      ...node.refs.nodes.filter((r) => own.test(r.name)).flatMap((r) => r.target?.committedDate ?? []),
    ],
  };
}

/** Flag a stale claim once: the marker comment, then `needs-you` (whose event pushes). True if it flagged. */
export async function flagStale(issue: number, token: string, fetchFn: Fetch = fetch): Promise<boolean> {
  const comments = (await (await github(fetchFn, token, 'GET', `issues/${issue}/comments?per_page=100`)).json()) as {
    body?: string;
  }[];
  if (comments.some((c) => c.body?.includes(STALE_MARKER))) return false;
  await github(fetchFn, token, 'POST', `issues/${issue}/comments`, {
    body:
      'Assigned with no PR and no activity for 3 days. Unassign to let auto-start take it, or carry on ' +
      `(docs/agents/issue-tracker.md → Board sync).\n\n${STALE_MARKER}`,
  });
  await github(fetchFn, token, 'POST', `issues/${issue}/labels`, { labels: [NEEDS_YOU_LABEL] });
  return true;
}

import { pathToFileURL } from 'node:url';

// Keeps each issue's card on the project board in step with its PRs and assignees
// (docs/agents/issue-tracker.md → Project board). Run by .github/workflows/board-sync.yml on
// every PR or assignment change and on a schedule. Each run reconciles the whole board, so
// a missed event is fixed by the next one. The decisions are pure functions; the CLI at the
// bottom only fetches and writes.

const OWNER = 'itay28';
const REPO = 'Military-TD';
const PROJECT_NUMBER = 4;

export type CardStatus = 'In progress' | 'In review';

/** A PR and the issues it closes. */
export interface PullRequest {
  readonly isDraft: boolean;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
  /** The branch it targets: `main`, or a parent PR's branch for a stacked PR. */
  readonly base: string;
  readonly issues: readonly number[];
}

/** An open issue's card on the board. */
export interface BoardIssue {
  readonly number: number;
  readonly status: string | undefined;
  readonly assigned: boolean;
  /** Release issues stand in for milestones and move with them (scripts/release-board.ts). */
  readonly release: boolean;
}

export interface Move {
  readonly issue: number;
  readonly from: string | undefined;
  readonly to: CardStatus;
}

// A closing keyword, then `#n`, `owner/repo#n` or this repo's issue URL, as GitHub reads them.
const CLOSING =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/|([\w.-]+)\/([\w.-]+)#|#)(\d+)/gi;

/**
 * The issues a PR closes: GitHub's own links (`linked`), plus `Closes #n` in the body. GitHub only
 * links PRs that target the default branch, so the body is what covers stacked PRs.
 */
export function closingIssues(body: string, linked: readonly number[]): number[] {
  const issues = [...linked];
  for (const [, urlOwner, urlRepo, refOwner, refRepo, number] of body.matchAll(CLOSING)) {
    const owner = urlOwner ?? refOwner;
    const repo = urlRepo ?? refRepo;
    if (owner && (owner.toLowerCase() !== OWNER.toLowerCase() || repo?.toLowerCase() !== REPO.toLowerCase())) continue;
    const n = Number(number);
    if (!issues.includes(n)) issues.push(n);
  }
  return issues;
}

/**
 * The Status an issue's card should have, or undefined to leave it:
 * a PR ready for review (or a stacked PR merged into its parent) → In review; a draft PR, or
 * assigned with no PR → In progress. Done cards and release issues are never moved, and
 * unassigned issues with no PR stay where they are.
 */
export function desiredStatus(
  issue: BoardIssue,
  prs: readonly PullRequest[],
  defaultBranch = 'main',
): CardStatus | undefined {
  if (issue.release || issue.status === 'Done') return undefined;
  const inReview = prs.some(
    (pr) => (pr.state === 'OPEN' && !pr.isDraft) || (pr.state === 'MERGED' && pr.base !== defaultBranch),
  );
  const drafting = prs.some((pr) => pr.state === 'OPEN' && pr.isDraft);
  const target: CardStatus | undefined = inReview
    ? 'In review'
    : drafting || issue.assigned
      ? 'In progress'
      : undefined;
  return target === issue.status ? undefined : target;
}

/** The cards to move: each open issue against the PRs that close it. */
export function planMoves(issues: readonly BoardIssue[], prs: readonly PullRequest[], defaultBranch = 'main'): Move[] {
  return issues.flatMap((issue) => {
    const to = desiredStatus(
      issue,
      prs.filter((pr) => pr.issues.includes(issue.number)),
      defaultBranch,
    );
    return to ? [{ issue: issue.number, from: issue.status, to }] : [];
  });
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || body.errors?.length || !body.data)
    throw new Error(body.errors?.map((e) => e.message).join('; ') ?? `HTTP ${response.status}`);
  return body.data;
}

const BOARD_QUERY = `query($owner: String!, $project: Int!, $cursor: String) {
  user(login: $owner) {
    projectV2(number: $project) {
      id
      field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          content {
            ... on Issue {
              number
              state
              repository { nameWithOwner }
              assignees { totalCount }
              labels(first: 20) { nodes { name } }
            }
          }
        }
      }
    }
  }
}`;

interface BoardData {
  user: {
    projectV2: {
      id: string;
      field: { id: string; options: { id: string; name: string }[] };
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          fieldValueByName: { name?: string } | null;
          content: {
            number?: number;
            state?: string;
            repository?: { nameWithOwner: string };
            assignees?: { totalCount: number };
            labels?: { nodes: { name: string }[] };
          } | null;
        }[];
      };
    };
  };
}

const PR_FIELDS = `nodes { isDraft state baseRefName body closingIssuesReferences(first: 20) { nodes { number } } }`;

// Open PRs, and the latest merged ones (a stacked PR merged into its parent keeps its issue In review).
const PR_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    open: pullRequests(states: OPEN, first: 100) { ${PR_FIELDS} }
    merged: pullRequests(states: MERGED, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) { ${PR_FIELDS} }
  }
}`;

interface PrNode {
  isDraft: boolean;
  state: PullRequest['state'];
  baseRefName: string;
  body: string;
  closingIssuesReferences: { nodes: { number: number }[] };
}

interface PrData {
  repository: { defaultBranchRef: { name: string }; open: { nodes: PrNode[] }; merged: { nodes: PrNode[] } };
}

const SET_STATUS = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) {
    projectV2Item { id }
  }
}`;

async function sync(token: string, dryRun: boolean): Promise<void> {
  const items = new Map<number, string>();
  const issues: BoardIssue[] = [];
  let project: BoardData['user']['projectV2'] | undefined;
  let cursor: string | null = null;
  do {
    const data: BoardData = await graphql<BoardData>(token, BOARD_QUERY, {
      owner: OWNER,
      project: PROJECT_NUMBER,
      cursor,
    });
    project = data.user.projectV2;
    for (const node of project.items.nodes) {
      const c = node.content;
      if (c?.number === undefined || c.state !== 'OPEN' || c.repository?.nameWithOwner !== `${OWNER}/${REPO}`) continue;
      items.set(c.number, node.id);
      issues.push({
        number: c.number,
        status: node.fieldValueByName?.name,
        assigned: (c.assignees?.totalCount ?? 0) > 0,
        release: c.labels?.nodes.some((l) => l.name === 'release') ?? false,
      });
    }
    cursor = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (cursor);

  const { repository } = await graphql<PrData>(token, PR_QUERY, { owner: OWNER, name: REPO });
  const prs = [...repository.open.nodes, ...repository.merged.nodes].map((pr): PullRequest => ({
    isDraft: pr.isDraft,
    state: pr.state,
    base: pr.baseRefName,
    issues: closingIssues(
      pr.body,
      pr.closingIssuesReferences.nodes.map((i) => i.number),
    ),
  }));

  const moves = planMoves(issues, prs, repository.defaultBranchRef.name);
  if (!moves.length) console.log(`Board in step: ${issues.length} open issues checked, nothing to move.`);
  for (const move of moves) {
    const option = project.field.options.find((o) => o.name === move.to);
    if (!option) throw new Error(`no "${move.to}" option on the Status field`);
    if (!dryRun)
      await graphql(token, SET_STATUS, {
        project: project.id,
        item: items.get(move.issue),
        field: project.field.id,
        option: option.id,
      });
    console.log(`#${move.issue}: ${move.from ?? 'no status'} → ${move.to}${dryRun ? ' (dry run)' : ''}`);
  }
}

// CLI: `node scripts/board-sync.ts [--dry-run]`, with PROJECT_TOKEN (classic PAT, project + repo scopes).
// A missing token or an API error fails the run, so a board that isn't syncing shows up red.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env['PROJECT_TOKEN']?.trim();
  if (!token) {
    console.log(
      '::error::PROJECT_TOKEN is not set, so the board was not synced. ' +
        'Add a classic PAT with project + repo scopes as the repo secret PROJECT_TOKEN.',
    );
    process.exitCode = 1;
  } else {
    try {
      await sync(token, process.argv.includes('--dry-run'));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}

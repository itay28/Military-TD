import { pathToFileURL } from 'node:url';
import {
  AUTO_AGENT_LABEL,
  commentNoSize,
  github,
  HOLD_LABEL,
  NEEDS_YOU_LABEL,
  planStarts,
  startIssue,
  type OpenPr,
  type Routines,
  type StartIssue,
} from './auto-start.ts';

// Keeps each issue's card on the project board in step with its PRs, assignees and the Ready rule
// (docs/agents/issue-tracker.md → Project board). Run by .github/workflows/board-sync.yml on
// every PR or assignment change and on a schedule. Each run reconciles the whole board, so
// a missed event is fixed by the next one. It also copies `size:*`, `priority:*` and `area:*` labels
// to the Size, Priority and Area fields (#205). The decisions are pure functions; the CLI at the
// bottom only fetches and writes. With AUTO_SPAWN=on it then starts agents (scripts/auto-start.ts).

const OWNER = 'itay28';
const REPO = 'Military-TD';
const PROJECT_NUMBER = 4;

export type CardStatus = 'Backlog' | 'Ready' | 'In progress' | 'In review';

/** The label an issue needs before agents may pick it up (docs/agents/triage-labels.md). */
const READY_LABEL = 'ready-for-agent';
/** Labels of issues that track other work rather than being work (see `BoardIssue.tracker`). */
const TRACKER_LABELS = ['release', 'epic'];

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
  /**
   * Trackers stand in for other work and keep their own Status: release issues move with their
   * milestone (scripts/release-board.ts), epics with their sub-issues.
   */
  readonly tracker: boolean;
  /** Labelled `ready-for-agent`. */
  readonly labelled: boolean;
  /** Has open native "blocked by" dependencies. */
  readonly blocked: boolean;
  readonly milestone: number | null;
}

/** An open milestone, as the repo query returns it. */
export interface Milestone {
  readonly number: number;
  readonly title: string;
  readonly dueOn: string | null;
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
 * The open milestones in the order agents work on them: by due date, then the undated ones by the
 * version in the title (the same rule as the `promote-ready` skill). Milestones with neither come last.
 */
export function milestoneOrder(milestones: readonly Milestone[]): number[] {
  const dated = milestones.filter((m) => m.dueOn).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));
  // [major, minor, patch] from a title like 'v0.2.0 — Combat depth'; null when it has no version.
  const version = (m: Milestone): [number, number, number] | null => {
    const match = /v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(m.title);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
  };
  const versioned = milestones.filter((m) => !m.dueOn && version(m));
  versioned.sort((a, b) => {
    const [x, y] = [version(a)!, version(b)!];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  return [...dated, ...versioned].map((m) => m.number);
}

/** The milestone agents work on: the first in `milestoneOrder`. Null without open milestones. */
export function currentMilestone(milestones: readonly Milestone[]): number | null {
  return milestoneOrder(milestones)[0] ?? null;
}

/**
 * The Status an issue's card should have, or undefined to leave it:
 * a PR ready for review (or a stacked PR merged into its parent) → In review; a draft PR, or
 * assigned with no PR → In progress. With no PR and no assignee, a Backlog or Ready card follows
 * the Ready rule: current milestone, `ready-for-agent` and no open blockers → Ready, else Backlog.
 * Without an open milestone nothing is Ready. Done cards and trackers (release issues, epics)
 * are never moved; In progress and In review cards with no PR and no assignee stay put.
 */
export function desiredStatus(
  issue: BoardIssue,
  prs: readonly PullRequest[],
  defaultBranch = 'main',
  current: number | null = null,
): CardStatus | undefined {
  if (issue.tracker || issue.status === 'Done') return undefined;
  const inReview = prs.some(
    (pr) => (pr.state === 'OPEN' && !pr.isDraft) || (pr.state === 'MERGED' && pr.base !== defaultBranch),
  );
  const drafting = prs.some((pr) => pr.state === 'OPEN' && pr.isDraft);
  let target: CardStatus | undefined = inReview ? 'In review' : drafting || issue.assigned ? 'In progress' : undefined;
  if (!target && (issue.status === undefined || issue.status === 'Backlog' || issue.status === 'Ready')) {
    const startable = current !== null && issue.milestone === current && issue.labelled && !issue.blocked;
    target = startable ? 'Ready' : 'Backlog';
  }
  return target === issue.status ? undefined : target;
}

/** The cards to move: each open issue against the PRs that close it. */
export function planMoves(
  issues: readonly BoardIssue[],
  prs: readonly PullRequest[],
  defaultBranch = 'main',
  current: number | null = null,
): Move[] {
  return issues.flatMap((issue) => {
    const to = desiredStatus(
      issue,
      prs.filter((pr) => pr.issues.includes(issue.number)),
      defaultBranch,
      current,
    );
    return to ? [{ issue: issue.number, from: issue.status, to }] : [];
  });
}

/** The board fields set from labels (#205): `size:M` → Size M, `priority:P1` → Priority P1, `area:ui` → Area ui. */
export type LabelField = 'Size' | 'Priority' | 'Area';
const FIELD_LABELS: readonly { field: LabelField; prefix: string; values: readonly string[] }[] = [
  // Ordered small to big and urgent to not, so the last value wins a tie (issue-tracker.md).
  { field: 'Size', prefix: 'size:', values: ['XS', 'S', 'M', 'L', 'XL'] },
  { field: 'Priority', prefix: 'priority:', values: ['P0', 'P1', 'P2', 'P3'] },
  { field: 'Area', prefix: 'area:', values: ['core', 'towers', 'units', 'ui', 'art', 'infra'] },
];

export interface FieldsFromLabels {
  readonly fields: Partial<Record<LabelField, string>>;
  /** The `size:*` and `priority:*` labels read: the board keeps the value. `area:*` labels stay, for filtering. */
  readonly removeLabels: string[];
}

/**
 * The board fields an issue's labels ask for. Two size labels: the bigger wins; two priority
 * labels: the less urgent wins; two different area labels: Area is left alone. Labels with an
 * unknown value are ignored, and stay on the issue.
 */
export function planFieldsFromLabels(labels: readonly string[]): FieldsFromLabels {
  const fields: Partial<Record<LabelField, string>> = {};
  const removeLabels: string[] = [];
  for (const { field, prefix, values } of FIELD_LABELS) {
    const found = labels.filter((l) => l.startsWith(prefix) && values.includes(l.slice(prefix.length)));
    const picked = found.map((l) => l.slice(prefix.length)).sort((a, b) => values.indexOf(a) - values.indexOf(b));
    if (field === 'Area') {
      if (new Set(picked).size === 1) fields[field] = picked[0]!;
    } else {
      if (picked.length) fields[field] = picked.at(-1)!;
      removeLabels.push(...found);
    }
  }
  return { fields, removeLabels };
}

/** An issue's labels and its board fields' current values. */
export interface LabelledItem {
  readonly number: number;
  readonly labels: readonly string[];
  readonly fields: Partial<Record<LabelField, string | undefined>>;
}

export interface FieldUpdate {
  readonly issue: number;
  /** Fields whose value differs from the labels. */
  readonly set: readonly { field: LabelField; value: string }[];
  readonly removeLabels: readonly string[];
}

/** For each issue, the fields to set and the labels to remove; issues with nothing to do are left out. */
export function planFieldUpdates(items: readonly LabelledItem[]): FieldUpdate[] {
  return items.flatMap((item) => {
    const { fields, removeLabels } = planFieldsFromLabels(item.labels);
    const set = FIELD_LABELS.flatMap(({ field }) => {
      const value = fields[field];
      return value !== undefined && value !== item.fields[field] ? [{ field, value }] : [];
    });
    return set.length || removeLabels.length ? [{ issue: item.number, set, removeLabels }] : [];
  });
}

/** Auto-start's issues with this run's Size and Priority updates, so a newly sized issue can start now. */
export function withFieldUpdates(issues: readonly StartIssue[], updates: readonly FieldUpdate[]): StartIssue[] {
  return issues.map((issue) => {
    const set = updates.find((u) => u.issue === issue.number)?.set ?? [];
    const value = (field: LabelField) => set.find((s) => s.field === field)?.value;
    if (!value('Size') && !value('Priority')) return issue;
    return { ...issue, size: value('Size') ?? issue.size, priority: value('Priority') ?? issue.priority };
  });
}

/** Removes a label; one a concurrent run already removed (404) is fine. */
async function removeLabel(token: string, issue: number, label: string): Promise<void> {
  try {
    await github(fetch, token, 'DELETE', `issues/${issue}/labels/${encodeURIComponent(label)}`);
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
  }
}

export async function graphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
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
      sizeField: field(name: "Size") { ... on ProjectV2SingleSelectField { id options { id name } } }
      priorityField: field(name: "Priority") { ... on ProjectV2SingleSelectField { id options { id name } } }
      areaField: field(name: "Area") { ... on ProjectV2SingleSelectField { id options { id name } } }
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          size: fieldValueByName(name: "Size") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          priority: fieldValueByName(name: "Priority") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          area: fieldValueByName(name: "Area") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          content {
            ... on Issue {
              number
              state
              repository { nameWithOwner }
              assignees { totalCount }
              labels(first: 20) { nodes { name } }
              milestone { number }
              issueDependenciesSummary { blockedBy }
              blockedBy(first: 20) { nodes { number state } }
            }
          }
        }
      }
    }
  }
}`;

interface SelectField {
  id: string;
  options: { id: string; name: string }[];
}

interface BoardData {
  user: {
    projectV2: {
      id: string;
      field: SelectField;
      sizeField: SelectField | null;
      priorityField: SelectField | null;
      areaField: SelectField | null;
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: {
          id: string;
          fieldValueByName: { name?: string } | null;
          size: { name?: string } | null;
          priority: { name?: string } | null;
          area: { name?: string } | null;
          content: {
            number?: number;
            state?: string;
            repository?: { nameWithOwner: string };
            assignees?: { totalCount: number };
            labels?: { nodes: { name: string }[] };
            milestone?: { number: number } | null;
            issueDependenciesSummary?: { blockedBy: number } | null;
            blockedBy?: { nodes: { number: number; state: string }[] };
          } | null;
        }[];
      };
    };
  };
}

const PR_FIELDS = `nodes { isDraft state baseRefName headRefName body closingIssuesReferences(first: 20) { nodes { number } } }`;

// Open PRs, the latest merged ones (a stacked PR merged into its parent keeps its issue In review),
// and the open milestones (for the Ready rule).
const PR_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    milestones(states: OPEN, first: 50) { nodes { number title dueOn } }
    open: pullRequests(states: OPEN, first: 100) { totalCount ${PR_FIELDS} }
    merged: pullRequests(states: MERGED, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) { ${PR_FIELDS} }
  }
}`;

interface PrNode {
  isDraft: boolean;
  state: PullRequest['state'];
  baseRefName: string;
  headRefName: string;
  body: string;
  closingIssuesReferences: { nodes: { number: number }[] };
}

interface PrData {
  repository: {
    defaultBranchRef: { name: string };
    milestones: { nodes: Milestone[] };
    open: { totalCount: number; nodes: PrNode[] };
    merged: { nodes: PrNode[] };
  };
}

// Sets a single-select field: Status, or Size, Priority and Area from labels.
const SET_FIELD = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) {
    projectV2Item { id }
  }
}`;

/** What auto-start needs beyond a sync: off unless AUTO_SPAWN is `on`. */
export interface AutoStart {
  readonly stack: boolean;
  readonly routines: Routines;
}

async function sync(token: string, dryRun: boolean, autoStart: AutoStart | undefined): Promise<void> {
  const items = new Map<number, string>();
  const issues: BoardIssue[] = [];
  const startIssues: StartIssue[] = [];
  const labelled: LabelledItem[] = [];
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
        tracker: c.labels?.nodes.some((l) => TRACKER_LABELS.includes(l.name)) ?? false,
        labelled: c.labels?.nodes.some((l) => l.name === READY_LABEL) ?? false,
        blocked: (c.issueDependenciesSummary?.blockedBy ?? 0) > 0,
        milestone: c.milestone?.number ?? null,
      });
      const labels = c.labels?.nodes.map((l) => l.name) ?? [];
      labelled.push({
        number: c.number,
        labels,
        fields: { Size: node.size?.name, Priority: node.priority?.name, Area: node.area?.name },
      });
      startIssues.push({
        ...issues.at(-1)!,
        hold: labels.includes(HOLD_LABEL),
        needsYou: labels.includes(NEEDS_YOU_LABEL),
        autoAgent: labels.includes(AUTO_AGENT_LABEL),
        size: node.size?.name,
        priority: node.priority?.name,
        blockedBy: c.blockedBy?.nodes.filter((b) => b.state === 'OPEN').map((b) => b.number) ?? [],
      });
    }
    cursor = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
  } while (cursor);

  const { repository } = await graphql<PrData>(token, PR_QUERY, { owner: OWNER, name: REPO });
  if (repository.open.totalCount > repository.open.nodes.length)
    console.log(
      `::warning::${repository.open.totalCount} open PRs, only the first ${repository.open.nodes.length} were read; some cards may not move. Paginate PR_QUERY.`,
    );
  const prs = [...repository.open.nodes, ...repository.merged.nodes].map((pr): PullRequest & { head: string } => ({
    isDraft: pr.isDraft,
    state: pr.state,
    base: pr.baseRefName,
    head: pr.headRefName,
    issues: closingIssues(
      pr.body,
      pr.closingIssuesReferences.nodes.map((i) => i.number),
    ),
  }));

  const defaultBranch = repository.defaultBranchRef.name;
  const order = milestoneOrder(repository.milestones.nodes);
  const moves = planMoves(issues, prs, defaultBranch, order[0] ?? null);
  if (!moves.length) console.log(`Board in step: ${issues.length} open issues checked, nothing to move.`);
  for (const move of moves) {
    const option = project.field.options.find((o) => o.name === move.to);
    if (!option) throw new Error(`no "${move.to}" option on the Status field`);
    if (!dryRun)
      await graphql(token, SET_FIELD, {
        project: project.id,
        item: items.get(move.issue),
        field: project.field.id,
        option: option.id,
      });
    console.log(`#${move.issue}: ${move.from ?? 'no status'} → ${move.to}${dryRun ? ' (dry run)' : ''}`);
  }

  // Size, Priority and Area from labels (#205), before auto-start so a newly sized issue starts now.
  const updates = planFieldUpdates(labelled);
  const fieldOf: Record<LabelField, SelectField | null> = {
    Size: project.sizeField,
    Priority: project.priorityField,
    Area: project.areaField,
  };
  for (const update of updates) {
    for (const { field, value } of update.set) {
      const option = fieldOf[field]?.options.find((o) => o.name === value);
      if (!option) {
        // Board options drifted from the label values: skip this field rather than abort the run.
        console.warn(`#${update.issue}: no "${value}" option on the ${field} field, skipped`);
        continue;
      }
      if (!dryRun)
        await graphql(token, SET_FIELD, {
          project: project.id,
          item: items.get(update.issue),
          field: fieldOf[field]!.id,
          option: option.id,
        });
      console.log(`#${update.issue}: ${field} → ${value}${dryRun ? ' (dry run)' : ''}`);
    }
    for (const label of update.removeLabels) {
      if (!dryRun) await removeLabel(token, update.issue, label);
      console.log(`#${update.issue}: removed label ${label}${dryRun ? ' (dry run)' : ''}`);
    }
  }

  if (!autoStart) return;
  // An unread open PR could close an issue that would then be started a second time.
  if (repository.open.totalCount > repository.open.nodes.length)
    throw new Error('Auto-start skipped: not every open PR was read (see the warning above). Paginate PR_QUERY.');
  const moved = new Map(moves.map((m) => [m.issue, m.to]));
  const openPrs: OpenPr[] = prs.filter((pr) => pr.state === 'OPEN');
  const plan = planStarts(
    withFieldUpdates(startIssues, updates).map((i) => ({ ...i, status: moved.get(i.number) ?? i.status })),
    openPrs,
    order,
    { defaultBranch, stack: autoStart.stack },
  );
  if (!plan.starts.length) console.log('Auto-start: nothing to start.');
  // Try every start and comment before failing the run, so one bad fire doesn't block the rest.
  const failures: string[] = [];
  // Each routine has its own fire limit; one that refused for now isn't fired again this run (#200).
  const limited = new Set<string>();
  for (const start of plan.starts) {
    const what = `#${start.issue}: start ${start.model} on ${start.base}`;
    if (limited.has(start.model)) {
      console.log(`${what}: skipped, the ${start.model} routine refused a fire this run; retrying next run`);
      continue;
    }
    if (dryRun) {
      console.log(`${what} (dry run)`);
      continue;
    }
    try {
      if ((await startIssue(start, token, autoStart.routines)) === 'later') {
        console.log(`${what}: the fire was refused for now (usage or rate limit), un-claimed; retrying next run`);
        limited.add(start.model);
        continue;
      }
      console.log(what);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const issue of plan.noSize) {
    if (dryRun) console.log(`#${issue}: no Size, would ask for one (dry run)`);
    else if (await commentNoSize(issue, token)) console.log(`#${issue}: no Size, asked for one`);
  }
  if (failures.length) throw new Error(failures.join('\n'));
}

/**
 * Auto-start's settings from the environment: undefined unless AUTO_SPAWN is `on`. With it on,
 * a missing routine secret is an error, so a misconfigured auto-start fails loudly.
 */
export function autoStartFromEnv(env: Readonly<Record<string, string | undefined>>): AutoStart | undefined {
  if (env['AUTO_SPAWN']?.trim() !== 'on') return undefined;
  const read = (name: string) => {
    const value = env[name]?.trim();
    if (!value)
      throw new Error(
        `AUTO_SPAWN is on but the repo secret ${name} is not set (docs/agents/issue-tracker.md → Auto-start).`,
      );
    return value;
  };
  return {
    stack: env['AUTO_STACK']?.trim() === 'on',
    routines: {
      sonnet: { url: read('ROUTINE_SONNET_URL'), token: read('ROUTINE_SONNET_TOKEN') },
      opus: { url: read('ROUTINE_OPUS_URL'), token: read('ROUTINE_OPUS_TOKEN') },
    },
  };
}

// CLI: `node scripts/board-sync.ts [--dry-run]`, with PROJECT_TOKEN (classic PAT, project + repo scopes).
// Auto-start reads AUTO_SPAWN, AUTO_STACK and the ROUTINE_* secrets (autoStartFromEnv); --dry-run
// logs what it would start. A missing token or an API error fails the run, so a board that isn't
// syncing shows up red.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env['PROJECT_TOKEN']?.trim();
  if (!token) {
    console.log(
      '::error::PROJECT_TOKEN is not set, so the board was not synced. ' +
        'Add a classic PAT with project + repo scopes as the repo secret PROJECT_TOKEN.',
    );
    process.exitCode = 1;
  } else {
    // A misconfigured auto-start still fails the run, but only after the board is synced.
    let autoStart: AutoStart | undefined;
    let setupError: unknown;
    try {
      autoStart = autoStartFromEnv(process.env);
    } catch (error) {
      setupError = error;
    }
    try {
      await sync(token, process.argv.includes('--dry-run'), autoStart);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
    if (setupError) {
      console.log(
        `::error::${setupError instanceof Error ? setupError.message : String(setupError)} Auto-start was skipped.`,
      );
      process.exitCode = 1;
    }
  }
}

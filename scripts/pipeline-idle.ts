import {
  github,
  HANDOFF_MARKER,
  HOLD_LABEL,
  INFRA_LABEL,
  NEEDS_INFO_LABEL,
  NEEDS_YOU_LABEL,
  READY_LABEL,
  stackBase,
  type Fetch,
} from './auto-start.ts';

// The idle warning (#226, docs/agents/issue-tracker.md → Auto-start): with AUTO_SPAWN on, a Board sync run that
// starts nothing while no agent works means the pipeline has stopped. One `Pipeline is idle` issue says why,
// labelled `needs-you` so *Notify* pushes it. The decisions are pure; findIdleIssue and applyIdle are the only
// calls with side effects, and take `fetch` so tests can mock it. Run from scripts/board-sync.ts.

/** Hidden in the idle issue's body, so later runs find it. */
export const IDLE_MARKER = '<!-- pipeline-starved -->';
export const IDLE_TITLE = 'Pipeline is idle';
/** The Infra & testing epic: the idle issue is filed under it. */
const INFRA_EPIC = 24;
const TRIAGE_LABEL = 'needs-triage';
const HUMAN_LABEL = 'ready-for-human';
const REASONS = /<!-- pipeline-starved:reasons ?(.*?) -->/;

/**
 * Starved: the run planned no start and no retry, and no `auto-agent` issue is In progress (no agent is
 * working). Only asked with AUTO_SPAWN on: Board sync returns before auto-start otherwise.
 */
export function isStarved(
  issues: readonly { readonly autoAgent: boolean; readonly status: string | undefined }[],
  planned: number,
): boolean {
  return planned === 0 && !issues.some((i) => i.autoAgent && i.status === 'In progress');
}

/** An open issue on the board, with the fields the reasons read. */
export interface IdleIssue {
  readonly number: number;
  readonly labels: readonly string[];
  /** Its card's Status after this run's moves. */
  readonly status: string | undefined;
  readonly assigned: boolean;
  readonly tracker: boolean;
  readonly milestone: number | null;
  readonly size: string | undefined;
  /** The issues blocking it that are still open. */
  readonly blockedBy: readonly number[];
  readonly infra: boolean;
}

/** An open PR, its labels and the issues it closes. */
export interface IdlePr {
  readonly number: number;
  readonly head: string;
  readonly base: string;
  readonly labels: readonly string[];
  readonly issues: readonly number[];
}

/** One thing that would unblock the pipeline. `key` is stable across runs; a new set of keys pushes again. */
export interface Reason {
  readonly group: 'waiting' | 'triage' | 'not-startable' | 'nothing-left';
  readonly key: string;
  readonly text: string;
}

export interface ReasonOptions {
  readonly defaultBranch: string;
  /** AUTO_STACK is on. */
  readonly stack: boolean;
  /** The idle issue itself, left out. */
  readonly exclude?: number | undefined;
}

const labelList = (labels: readonly string[]) => labels.map((l) => `\`${l}\``).join(', ');

/**
 * Why nothing is startable, grouped by what would unblock it: waiting on you (`needs-you`/`needs-info` issues
 * and PRs, `ready-for-human` in the current milestone), needs triage (counts in the current and next
 * milestone), not startable (`ready-for-agent` issues in those milestones, or with none, that lack a Size, are
 * XL, are game work with no milestone, or are blocked), and nothing left (neither milestone has an open
 * `ready-for-agent` issue).
 */
export function idleReasons(
  issues: readonly IdleIssue[],
  prs: readonly IdlePr[],
  order: readonly number[],
  titles: ReadonlyMap<number, string>,
  { defaultBranch, stack, exclude }: ReasonOptions,
): Reason[] {
  const [current, next] = order;
  const open = issues.filter((i) => i.number !== exclude).sort((a, b) => a.number - b.number);
  const title = (m: number) => titles.get(m) ?? `milestone ${m}`;
  const reasons: Reason[] = [];

  for (const i of open) {
    const asks = i.labels.filter((l) => l === NEEDS_YOU_LABEL || l === NEEDS_INFO_LABEL);
    const human = i.labels.includes(HUMAN_LABEL) && current !== undefined && i.milestone === current;
    if (!asks.length && !human) continue;
    const text = `#${i.number} ${labelList(human ? [...asks, HUMAN_LABEL] : asks)}`;
    reasons.push({
      group: 'waiting',
      key: `waiting:#${i.number}`,
      text: human ? `${text} in ${title(current)}` : text,
    });
  }
  for (const pr of [...prs].sort((a, b) => a.number - b.number)) {
    const asks = pr.labels.filter((l) => l === NEEDS_YOU_LABEL || l === NEEDS_INFO_LABEL);
    if (asks.length)
      reasons.push({ group: 'waiting', key: `waiting:PR#${pr.number}`, text: `PR #${pr.number} ${labelList(asks)}` });
  }

  const ahead = [current, next].filter((m) => m !== undefined);
  for (const m of ahead) {
    const count = open.filter((i) => i.milestone === m && i.labels.includes(TRIAGE_LABEL)).length;
    if (count)
      reasons.push({
        group: 'triage',
        key: `triage:${m}`,
        text: `${count} \`${TRIAGE_LABEL}\` issue${count === 1 ? '' : 's'} in ${title(m)}`,
      });
  }

  const ready = open.filter(
    (i) => i.labels.includes(READY_LABEL) && !i.tracker && (ahead.includes(i.milestone!) || i.milestone === null),
  );
  const candidates = ready.filter(
    (i) =>
      !i.assigned &&
      (i.status === undefined || i.status === 'Backlog' || i.status === 'Ready') &&
      ![HOLD_LABEL, NEEDS_YOU_LABEL, NEEDS_INFO_LABEL].some((l) => i.labels.includes(l)) &&
      !prs.some((pr) => pr.issues.includes(i.number)),
  );
  for (const i of candidates) {
    const n = `#${i.number}`;
    const add = (key: string, text: string) => reasons.push({ group: 'not-startable', key: `${key}:${n}`, text });
    if (i.milestone === null && !i.infra) add('no-milestone', `${n}: game work with no milestone (#225)`);
    if (i.size === undefined) add('no-size', `${n}: no Size`);
    else if (i.size === 'XL') add('xl', `${n}: Size XL, split it`);
    if (i.blockedBy.length) {
      const blockers = i.blockedBy.map((b) => {
        const closing = prs.find((pr) => pr.issues.includes(b));
        return `#${b} (${closing ? `PR #${closing.number}` : 'no PR'})`;
      });
      const base = stack ? null : stackBase(i.blockedBy, prs, defaultBranch);
      add(
        'blocked',
        `${n}: blocked by ${blockers.join(', ')}` +
          (base ? `. \`AUTO_STACK\` is off: it would stack on \`${base}\`` : ''),
      );
    }
  }

  if (!ready.length) {
    const names = ahead.map(title);
    reasons.push({
      group: 'nothing-left',
      key: 'nothing-left',
      text: names.length
        ? `${names.join(' and ')} ${names.length === 1 ? 'has' : 'have'} no open \`${READY_LABEL}\` issues`
        : `there is no open milestone and no open \`${READY_LABEL}\` infra issue`,
    });
  }
  return reasons;
}

const GROUPS: readonly { group: Reason['group']; heading: string }[] = [
  { group: 'waiting', heading: 'Waiting on you' },
  { group: 'triage', heading: 'Needs triage' },
  { group: 'not-startable', heading: 'Not startable' },
  { group: 'nothing-left', heading: 'Nothing left' },
];

const keyLine = (reasons: readonly Reason[]) =>
  reasons
    .map((r) => r.key)
    .sort()
    .join(' ');

/** The reasons as a grouped Markdown list. */
export function reasonList(reasons: readonly Reason[]): string {
  const sections = GROUPS.flatMap(({ group, heading }) => {
    const items = reasons.filter((r) => r.group === group);
    return items.length ? [`**${heading}**\n${items.map((r) => `- ${r.text}`).join('\n')}`] : [];
  });
  return sections.length ? sections.join('\n\n') : '- No reason found: check the *Board sync* log.';
}

/** One line for the phone push: how many reasons in each group. */
export function idleSummary(reasons: readonly Reason[]): string {
  const counts = GROUPS.flatMap(({ group, heading }) => {
    const n = reasons.filter((r) => r.group === group).length;
    return n ? [group === 'nothing-left' ? heading.toLowerCase() : `${heading.toLowerCase()} (${n})`] : [];
  });
  return `Nothing to start and no agent working${counts.length ? `: ${counts.join(', ')}` : ''}.`;
}

/** The idle issue's body: the reasons, when they were checked, the marker and the reason keys. */
export function idleBody(reasons: readonly Reason[], checkedAt: string): string {
  return (
    'Auto-start has nothing to start and no agent is working, so the pipeline has stopped (#226). ' +
    'What would unblock it:\n\n' +
    `${reasonList(reasons)}\n\n` +
    `Checked by *Board sync* at ${checkedAt}. While the pipeline stays idle it keeps this list current, and ` +
    'comments (with a push) when the reasons change. The first run that starts an agent closes this issue.\n\n' +
    `${IDLE_MARKER}\n<!-- pipeline-starved:reasons ${keyLine(reasons)} -->`
  );
}

export type IdleAction =
  | { readonly action: 'open' }
  | { readonly action: 'update'; readonly issue: number; readonly push: boolean }
  | { readonly action: 'close'; readonly issue: number; readonly started: readonly number[] };

/**
 * What to do with the idle issue: open it on the first starved run; while it is open, update its body, and
 * push again only when the set of reason keys changed; close it when the run started an agent.
 */
export function planIdle(
  starved: boolean,
  started: readonly number[],
  open: { readonly number: number; readonly body: string } | null,
  reasons: readonly Reason[],
): IdleAction | null {
  if (started.length) return open ? { action: 'close', issue: open.number, started: [...started] } : null;
  if (!starved) return null;
  if (!open) return { action: 'open' };
  return { action: 'update', issue: open.number, push: REASONS.exec(open.body)?.[1] !== keyLine(reasons) };
}

/** The open idle issue, found by its marker among the open `area:infra` issues. */
export async function findIdleIssue(
  token: string,
  fetchFn: Fetch = fetch,
): Promise<{ number: number; body: string } | null> {
  const issues = (await (
    await github(fetchFn, token, 'GET', `issues?state=open&labels=${INFRA_LABEL}&per_page=100`)
  ).json()) as { number: number; body?: string | null; pull_request?: unknown }[];
  const found = issues.find((i) => !i.pull_request && i.body?.includes(IDLE_MARKER));
  return found ? { number: found.number, body: found.body! } : null;
}

/** Removes a label; one already gone (404) is fine. */
async function removeLabel(fetchFn: Fetch, token: string, issue: number, label: string): Promise<void> {
  try {
    await github(fetchFn, token, 'DELETE', `issues/${issue}/labels/${encodeURIComponent(label)}`);
  } catch (error) {
    if ((error as { status?: number }).status !== 404) throw error;
  }
}

/**
 * Carry out an IdleAction. A push is the `auto-start:stuck` comment (*Notify* carries its first line) followed by
 * adding `needs-you`: Board sync writes with a PAT, so the label event starts *Notify*. Re-pushing removes
 * `needs-you` first, so adding it is a new event.
 */
export async function applyIdle(
  action: IdleAction,
  reasons: readonly Reason[],
  checkedAt: string,
  token: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  const body = idleBody(reasons, checkedAt);
  const stuck = (lead: string) => `${HANDOFF_MARKER}\n${lead} ${idleSummary(reasons)}\n\n${reasonList(reasons)}`;
  if (action.action === 'open') {
    const created = (await (await github(fetchFn, token, 'POST', 'issues', { title: IDLE_TITLE, body })).json()) as {
      number: number;
      id: number;
    };
    try {
      await github(fetchFn, token, 'POST', `issues/${INFRA_EPIC}/sub_issues`, { sub_issue_id: created.id });
    } catch (error) {
      console.log(`::warning::#${created.number}: filing the idle issue under #${INFRA_EPIC} failed: ${String(error)}`);
    }
    await github(fetchFn, token, 'POST', `issues/${created.number}/comments`, { body: stuck('The pipeline is idle.') });
    await github(fetchFn, token, 'POST', `issues/${created.number}/labels`, {
      labels: [NEEDS_YOU_LABEL, INFRA_LABEL],
    });
  } else if (action.action === 'update') {
    await github(fetchFn, token, 'PATCH', `issues/${action.issue}`, { body });
    if (!action.push) return;
    await github(fetchFn, token, 'POST', `issues/${action.issue}/comments`, {
      body: stuck('The pipeline is still idle, for new reasons.'),
    });
    await removeLabel(fetchFn, token, action.issue, NEEDS_YOU_LABEL);
    await github(fetchFn, token, 'POST', `issues/${action.issue}/labels`, { labels: [NEEDS_YOU_LABEL] });
  } else {
    await github(fetchFn, token, 'POST', `issues/${action.issue}/comments`, {
      body: `Auto-start started ${action.started.map((n) => `#${n}`).join(', ')}, so the pipeline is moving again.`,
    });
    await removeLabel(fetchFn, token, action.issue, NEEDS_YOU_LABEL);
    await github(fetchFn, token, 'PATCH', `issues/${action.issue}`, { state: 'closed', state_reason: 'completed' });
  }
}

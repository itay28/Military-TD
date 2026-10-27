// Auto-start (docs/agents/issue-tracker.md → Auto-start): after Board sync reconciles the board,
// it claims startable issues and fires the implement scheduled task for each. The selection is
// pure; startIssue and commentNoSize are the only calls with side effects, and take `fetch` so
// tests can mock it. Run from scripts/board-sync.ts when the repo variable AUTO_SPAWN is `on`.

const REPO_API = 'https://api.github.com/repos/itay28/Military-TD';
/** Who claimed issues are assigned to: the agents act through the maintainer's GitHub identity. */
const MAINTAINER = 'itay28';
/** Marks the issues auto-start claimed, so the cap counts only those. */
export const AUTO_AGENT_LABEL = 'auto-agent';
/** Keeps automation off an issue. */
export const HOLD_LABEL = 'hold';
/** Hands an issue (or PR) to the maintainer; scripts/notify.ts pushes when it lands. */
export const NEEDS_YOU_LABEL = 'needs-you';
/** An agent's open question to the maintainer: an intentional stop, never retried (#201). */
export const NEEDS_INFO_LABEL = 'needs-info';
/** Pipeline work: not tied to a game version, so it may have no milestone (#225). */
export const INFRA_LABEL = 'area:infra';
/** The label an issue needs before agents may pick it up (docs/agents/triage-labels.md). */
export const READY_LABEL = 'ready-for-agent';
/** Starts the comment auto-start posts before labelling an issue `needs-you`; the push carries it. */
export const HANDOFF_MARKER = '<!-- auto-start:stuck -->';
/** Hidden in the no-Size comment, so it's posted once. */
export const NO_SIZE_MARKER = '<!-- auto-start:no-size -->';
/** Posted when auto-start fires an implement task, with the session link (#201). */
export const FIRED_MARKER = '<!-- auto-start:fired -->';
/** Posted by the implement agent when it ends: PR marked ready, or a `needs-info` question. */
export const DONE_MARKER = '<!-- auto-start:done -->';
/** A fired session this long without a done marker or any activity is dead, and fired again. */
export const RETRY_IDLE_MS = 60 * 60 * 1000;
/** Left by Board sync when it dispatches *Size issue* for an issue, so it does that once (#225). */
export const SIZE_REQUESTED_MARKER = '<!-- size-issue:requested -->';
/** At most this many *Size issue* dispatches per Board sync run (#225). */
export const MAX_SIZE_REQUESTS = 3;
/** At most this many `auto-agent` issues In progress at once (#165). */
export const MAX_AGENTS = 5;
const FIRE_BETA = 'experimental-cc-routine-2026-04-01';

export type Model = 'sonnet' | 'opus';
const MODEL_BY_SIZE: Readonly<Record<string, Model>> = { XS: 'sonnet', S: 'sonnet', M: 'opus', L: 'opus' };
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

/** An open issue on the board, with the fields auto-start reads. */
export interface StartIssue {
  readonly number: number;
  /** Its card's Status after this run's moves. */
  readonly status: string | undefined;
  readonly assigned: boolean;
  readonly tracker: boolean;
  /** Labelled `ready-for-agent`. */
  readonly labelled: boolean;
  readonly hold: boolean;
  /** Labelled `needs-you`: handed to the maintainer, e.g. after a setup error (#200). */
  readonly needsYou: boolean;
  readonly autoAgent: boolean;
  /** Labelled `area:infra` (or Area `infra`): startable without a milestone (#225). */
  readonly infra: boolean;
  readonly size: string | undefined;
  readonly priority: string | undefined;
  readonly milestone: number | null;
  /** The issues blocking it that are still open. */
  readonly blockedBy: readonly number[];
}

/** An open PR (draft or not) and the issues it closes. */
export interface OpenPr {
  readonly head: string;
  readonly base: string;
  readonly issues: readonly number[];
}

export interface Start {
  readonly issue: number;
  /** The branch to work from and target: the default branch, or the parent PR's for a stack. */
  readonly base: string;
  readonly model: Model;
}

export interface StartPlan {
  readonly starts: Start[];
  /** Startable but for a missing Size: they get a one-time comment instead. */
  readonly noSize: number[];
}

export interface StartOptions {
  readonly defaultBranch?: string;
  /** AUTO_STACK: also start issues whose blockers are all in open PRs on one chain. */
  readonly stack?: boolean;
  readonly cap?: number;
}

/**
 * The stack-next rule: the branch an issue can start from. With no open blockers, the default
 * branch. Otherwise every open blocker must be closed by an open PR, and those PRs must sit on one
 * chain of branches down to the default branch (other PRs in between are fine); the base is the
 * chain's tip. Null when the issue can't stack.
 */
export function stackBase(blockedBy: readonly number[], prs: readonly OpenPr[], defaultBranch: string): string | null {
  if (!blockedBy.length) return defaultBranch;
  const byHead = new Map(prs.map((pr) => [pr.head, pr]));
  // The branches from a PR down to the default branch, or null if the chain breaks or loops.
  const chain = (pr: OpenPr): string[] | null => {
    const branches = [pr.head];
    for (let base = pr.base; base !== defaultBranch; base = byHead.get(base)!.base) {
      if (!byHead.has(base) || branches.includes(base)) return null;
      branches.push(base);
    }
    return branches;
  };
  const chains: string[][] = [];
  for (const blocker of blockedBy) {
    const closing = prs.filter((pr) => pr.issues.includes(blocker));
    if (closing.length !== 1) return null;
    const branches = chain(closing[0]!);
    if (!branches) return null;
    chains.push(branches);
  }
  // One chain: the longest contains every other blocker's PR branch.
  const tip = chains.reduce((a, b) => (b.length > a.length ? b : a));
  return chains.every((c) => tip.includes(c[0]!)) ? tip[0]! : null;
}

/**
 * The issues to start this run. Startable: a Backlog/Ready card (or none) with no open PR, no
 * assignee, `ready-for-agent`, no `hold`, not a tracker, Size XS–L, and unblocked (or stackable
 * when `stack` is on). In the current milestone that is exactly the Ready column. When the current
 * milestone (`order[0]`) has nothing to start, the next one is used (one milestone of look-ahead).
 * Infra issues without a milestone are startable in every run, next to that milestone's (#225);
 * other issues without one never start. Ordered by Priority (P0 first, none last), then issue
 * number; capped so at most `cap` `auto-agent` issues are In progress.
 */
export function planStarts(
  issues: readonly StartIssue[],
  prs: readonly OpenPr[],
  order: readonly number[],
  { defaultBranch = 'main', stack = false, cap = MAX_AGENTS }: StartOptions = {},
): StartPlan {
  const running = issues.filter((i) => i.autoAgent && i.status === 'In progress').length;
  const slots = Math.max(0, cap - running);
  const candidates = (inScope: (i: StartIssue) => boolean) => {
    const starts: { issue: StartIssue; start: Start }[] = [];
    const noSize: number[] = [];
    const eligible = issues.filter(
      (i) =>
        inScope(i) &&
        (i.status === undefined || i.status === 'Backlog' || i.status === 'Ready') &&
        !i.assigned &&
        !i.tracker &&
        i.labelled &&
        !i.hold &&
        !i.needsYou &&
        !prs.some((pr) => pr.issues.includes(i.number)),
    );
    for (const i of eligible) {
      const base = i.blockedBy.length && !stack ? null : stackBase(i.blockedBy, prs, defaultBranch);
      if (base === null) continue;
      if (i.size === undefined) noSize.push(i.number);
      else if (MODEL_BY_SIZE[i.size])
        starts.push({ issue: i, start: { issue: i.number, base, model: MODEL_BY_SIZE[i.size]! } });
    }
    return { starts, noSize };
  };
  const inMilestone = (milestone: number | undefined) => (i: StartIssue) =>
    milestone !== undefined && i.milestone === milestone;
  const infra = candidates((i) => i.infra && i.milestone === null);
  const current = candidates(inMilestone(order[0]));
  const plan = current.starts.length ? current : candidates(inMilestone(order[1]));
  const starts = [...infra.starts, ...plan.starts]
    .sort((a, b) => rank(a.issue.priority) - rank(b.issue.priority) || a.issue.number - b.issue.number)
    .map((s) => s.start);
  return {
    starts: starts.slice(0, slots),
    noSize: [...new Set([...infra.noSize, ...current.noSize, ...plan.noSize])],
  };
}

const rank = (priority: string | undefined) => {
  const i = PRIORITIES.indexOf(priority ?? '');
  return i < 0 ? PRIORITIES.length : i;
};

/** What an issue lacks before auto-start can pick it: a Size, and for game work a milestone (#225). */
export interface SizingNeeds {
  /** No Size on the board and no `size:*` label waiting for Board sync. */
  readonly size: boolean;
  /** Not infra, and no milestone. */
  readonly milestone: boolean;
}

/** Infra is the `area:infra` label or the board's Area `infra` (#225). */
export function isInfra(labels: readonly string[], boardArea?: string): boolean {
  return labels.includes(INFRA_LABEL) || boardArea === 'infra';
}

export function sizingNeeds(
  labels: readonly string[],
  boardSize: string | undefined,
  milestone: number | string | null,
  boardArea?: string,
): SizingNeeds {
  return {
    size: boardSize === undefined && !labels.some((l) => l.startsWith('size:')),
    milestone: milestone === null && !isInfra(labels, boardArea),
  };
}

/** An open issue as the sizing backfill sees it. */
export interface SizingCandidate {
  readonly number: number;
  readonly labels: readonly string[];
  readonly size: string | undefined;
  readonly area?: string | undefined;
  readonly milestone: number | null;
  readonly tracker: boolean;
}

/**
 * The issues Board sync asks the sizing agent about (#225): `ready-for-agent`, not a tracker, no
 * `hold`, `needs-info` or `needs-you`, and lacking a Size or (game work) a milestone.
 */
export function planSizingRequests(issues: readonly SizingCandidate[]): number[] {
  const skip = [HOLD_LABEL, NEEDS_INFO_LABEL, NEEDS_YOU_LABEL];
  return issues
    .filter((i) => i.labels.includes(READY_LABEL) && !i.tracker && !i.labels.some((l) => skip.includes(l)))
    .filter((i) => {
      const needs = sizingNeeds(i.labels, i.size, i.milestone, i.area);
      return needs.size || needs.milestone;
    })
    .map((i) => i.number);
}

/** A scheduled task's API trigger: its `/fire` URL and bearer token. */
export interface Routine {
  readonly url: string;
  readonly token: string;
}
export type Routines = Readonly<Record<Model, Routine>>;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** A GitHub REST call on this repo (`path` like `issues/12/labels`); throws on an error status. */
export async function github(
  fetchFn: Fetch,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const response = await fetchFn(`${REPO_API}/${path}`, {
    method,
    headers: {
      Authorization: `bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw Object.assign(new Error(`${method} ${path}: HTTP ${response.status} ${await response.text()}`), {
      status: response.status,
    });
  return response;
}

/**
 * Start a run of a scheduled task through its API trigger. Returns the new session's URL when
 * the response names one; throws on an error status.
 */
export async function fireRoutine(routine: Routine, text: string, fetchFn: Fetch = fetch): Promise<string | undefined> {
  const response = await fetchFn(routine.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${routine.token}`,
      'anthropic-beta': FIRE_BETA,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!response.ok)
    throw Object.assign(new Error(`fire: HTTP ${response.status} ${await response.text()}`), {
      status: response.status,
    });
  const body = (await response.json().catch(() => ({}))) as { claude_code_session_url?: string };
  return body.claude_code_session_url;
}

/**
 * Why a fire failed (#200). `temporary`: a rate or usage limit (429), a server error (5xx) or no
 * answer at all; a later run retries, nothing counts it and nobody is told. `setup`: any other
 * refusal (bad token, deleted routine), which a retry won't fix: it fails loudly.
 */
export function classifyFireError(error: unknown): 'temporary' | 'setup' {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return 'temporary';
  return status === 429 || status >= 500 ? 'temporary' : 'setup';
}

/** An `auto-agent` issue as the retry check sees it (#201). */
export interface RetryIssue {
  readonly number: number;
  readonly autoAgent: boolean;
  readonly hold: boolean;
  readonly needsYou: boolean;
  readonly needsInfo: boolean;
  /** Its latest comments, oldest first. */
  readonly comments: readonly { readonly body: string; readonly createdAt: string }[];
  /** The open PR that closes it, with the times of its latest commit and comment. */
  readonly pr?: {
    readonly number: number;
    readonly head: string;
    readonly draft: boolean;
    readonly activity: readonly string[];
  };
}

/** A dead implement session to fire again: the same model and base, continuing its branch and PR. */
export interface Retry extends Start {
  readonly branch?: string;
  readonly pr?: number;
}

const FIRE_META = /<!-- auto-start:fire-meta model=(\S+) base=(\S+) -->/;

/** The comment auto-start posts after a fire: the fired marker, plus the model and base for a retry. */
export const firedComment = (start: Start, sessionUrl?: string) =>
  `Auto-start fired the ${start.model} implement task${sessionUrl ? `: ${sessionUrl}` : ''}.\n\n` +
  `${FIRED_MARKER}\n<!-- auto-start:fire-meta model=${start.model} base=${start.base} -->`;

/**
 * The implement sessions that died (#201): an `auto-agent` issue whose latest fired marker has no
 * done marker after it, with no issue comment and no commit or comment on its PR for `idleMs`.
 * Never `hold`, `needs-you`, `needs-info` (an intentional stop) or a ready PR (the steward's).
 */
export function planRetries(issues: readonly RetryIssue[], now: number, idleMs = RETRY_IDLE_MS): Retry[] {
  const retries: Retry[] = [];
  for (const i of issues) {
    if (!i.autoAgent || i.hold || i.needsYou || i.needsInfo || (i.pr && !i.pr.draft)) continue;
    const firedAt = i.comments.findLastIndex((c) => c.body.includes(FIRED_MARKER));
    if (firedAt < 0 || i.comments.slice(firedAt).some((c) => c.body.includes(DONE_MARKER))) continue;
    const meta = FIRE_META.exec(i.comments[firedAt]!.body);
    const model = meta?.[1];
    if (model !== 'sonnet' && model !== 'opus') continue;
    const times = [...i.comments.map((c) => c.createdAt), ...(i.pr?.activity ?? [])].map(Date.parse);
    const idle = now - Math.max(...times);
    if (Number.isNaN(idle) || idle < idleMs) continue;
    retries.push({ issue: i.number, base: meta![2]!, model, ...(i.pr ? { branch: i.pr.head, pr: i.pr.number } : {}) });
  }
  return retries;
}

/** The fire `text` for a retry: `fireText` plus the branch and PR to continue, when they exist. */
export const retryText = (retry: Retry) =>
  fireText(retry) +
  (retry.branch ? `\nBranch: ${retry.branch}` : '') +
  (retry.pr === undefined ? '' : `\nPR: #${retry.pr}`);

/**
 * Fire a dead session's implement task again (#201). The claim stays as it is, and nothing counts
 * the retry. A temporary refusal returns `later`; a setup error hands the issue to the maintainer
 * (`needs-you`) and throws. A new fired marker restarts the 1 h clock.
 */
export async function retryIssue(
  retry: Retry,
  token: string,
  routines: Routines,
  fetchFn: Fetch = fetch,
): Promise<'started' | 'later'> {
  let sessionUrl: string | undefined;
  try {
    sessionUrl = await fireRoutine(routines[retry.model], retryText(retry), fetchFn);
  } catch (error) {
    if (classifyFireError(error) === 'temporary') return 'later';
    await handOffIssue(retry.issue, retry.model, error, token, fetchFn);
    throw new Error(`#${retry.issue}: retrying the ${retry.model} implement task failed: ${String(error)}`, {
      cause: error,
    });
  }
  await postFiredMarker(retry, sessionUrl, token, fetchFn);
  return 'started';
}

/** The fire `text`: what the implement prompt (docs/agents/prompts/implement.md) reads. */
export const fireText = (start: Start) =>
  `Issue: #${start.issue}\nBase branch: ${start.base}\nRepository: itay28/Military-TD`;

/**
 * Claim the issue (assign the maintainer, add `auto-agent`), then fire the implement task for its
 * model, and post the fired marker. The claim comes first so a second Board sync run can't start it
 * again. If any step fails, whatever part of the claim went through is undone, so the issue is startable next run.
 * A temporary fire refusal (classifyFireError) then returns `later`; anything else is rethrown
 * so the run goes red, and a setup error also hands the issue to the maintainer (`needs-you`).
 */
export async function startIssue(
  start: Start,
  token: string,
  routines: Routines,
  fetchFn: Fetch = fetch,
): Promise<'started' | 'later'> {
  const n = start.issue;
  const routine = routines[start.model];
  let firing = false;
  let sessionUrl: string | undefined;
  try {
    await github(fetchFn, token, 'POST', `issues/${n}/assignees`, { assignees: [MAINTAINER] });
    await github(fetchFn, token, 'POST', `issues/${n}/labels`, { labels: [AUTO_AGENT_LABEL] });
    firing = true;
    sessionUrl = await fireRoutine(routine, fireText(start), fetchFn);
  } catch (error) {
    // Undo whatever part of the claim went through; the original error is the one reported.
    const undo = await Promise.allSettled([
      github(fetchFn, token, 'DELETE', `issues/${n}/assignees`, { assignees: [MAINTAINER] }),
      github(fetchFn, token, 'DELETE', `issues/${n}/labels/${AUTO_AGENT_LABEL}`),
    ]);
    const undoErrors = undo.flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []));
    const unclaimed = undoErrors.length ? `un-claiming failed (${undoErrors.join('; ')})` : 'un-claimed';
    const kind = firing ? classifyFireError(error) : undefined;
    if (kind === 'temporary' && !undoErrors.length) return 'later';
    if (kind === 'setup') await handOffIssue(n, start.model, error, token, fetchFn);
    throw new Error(`#${n}: starting the ${start.model} implement task failed, ${unclaimed}: ${String(error)}`, {
      cause: error,
    });
  }
  await postFiredMarker(start, sessionUrl, token, fetchFn);
  return 'started';
}

/** The session is running, so a failed post only means a dead session can't be retried: warn, don't throw. */
async function postFiredMarker(
  start: Start,
  sessionUrl: string | undefined,
  token: string,
  fetchFn: Fetch,
): Promise<void> {
  try {
    await github(fetchFn, token, 'POST', `issues/${start.issue}/comments`, { body: firedComment(start, sessionUrl) });
  } catch (error) {
    console.log(`::warning::#${start.issue}: fired, but posting the fired marker failed: ${String(error)}`);
  }
}

/** Tell the maintainer a fire was refused for a reason a retry won't fix: a comment, then `needs-you` (which pushes). */
async function handOffIssue(n: number, model: Model, error: unknown, token: string, fetchFn: Fetch): Promise<void> {
  const secret = `ROUTINE_${model.toUpperCase()}`;
  await github(fetchFn, token, 'POST', `issues/${n}/comments`, {
    body:
      `${HANDOFF_MARKER}\nAuto-start couldn't start the ${model} implement task: its API trigger refused the fire ` +
      `(HTTP ${(error as { status?: number }).status}). Check the ${secret}_URL and ${secret}_TOKEN secrets and the ` +
      `implement-${model} routine at claude.ai/code/routines, then remove \`${NEEDS_YOU_LABEL}\` to start it again.`,
  });
  await github(fetchFn, token, 'POST', `issues/${n}/labels`, { labels: [NEEDS_YOU_LABEL] });
}

/**
 * Dispatch *Size issue* (.github/workflows/size-issue.yml) for an issue, once: the marker comment
 * left after the dispatch stops later runs. True if it dispatched. A failed dispatch leaves no
 * marker, so the next run tries again.
 */
export async function requestSizing(
  issue: number,
  token: string,
  ref: string,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  const comments = (await (await github(fetchFn, token, 'GET', `issues/${issue}/comments?per_page=100`)).json()) as {
    body?: string;
  }[];
  if (comments.some((c) => c.body?.includes(SIZE_REQUESTED_MARKER))) return false;
  await github(fetchFn, token, 'POST', 'actions/workflows/size-issue.yml/dispatches', {
    ref,
    inputs: { issue: String(issue) },
  });
  await github(fetchFn, token, 'POST', `issues/${issue}/comments`, {
    body:
      'Board sync asked the sizing agent to size this issue: it has no Size, or it is game work with no ' +
      'milestone (docs/agents/issue-tracker.md → Auto-start).\n\n' +
      SIZE_REQUESTED_MARKER,
  });
  return true;
}

/** Ask for a Size on an issue auto-start skipped for lacking one; once. True if it commented. */
export async function commentNoSize(issue: number, token: string, fetchFn: Fetch = fetch): Promise<boolean> {
  const comments = (await (await github(fetchFn, token, 'GET', `issues/${issue}/comments?per_page=100`)).json()) as {
    body?: string;
  }[];
  if (comments.some((c) => c.body?.includes(NO_SIZE_MARKER))) return false;
  await github(fetchFn, token, 'POST', `issues/${issue}/comments`, {
    body:
      'Auto-start skipped this issue: it has no **Size** on the project board. ' +
      'Set Size (XS–L) and the next *Board sync* run can start it (docs/agents/issue-tracker.md → Auto-start).\n\n' +
      NO_SIZE_MARKER,
  });
  return true;
}

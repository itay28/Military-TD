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
/** Feature work: frozen during the feature freeze (#84), unless it is also a bug or infra. */
export const ENHANCEMENT_LABEL = 'enhancement';
export const BUG_LABEL = 'bug';

/** The feature freeze is on only when the repo variable FEATURE_FREEZE is `true`; unset or anything else is off. */
export function isFeatureFreeze(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}
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
/** Fires a piece of work gets (the first one plus one retry); when the last one dies too, auto-start gives up (#303). */
export const MAX_FIRES = 2;
/** Posted when auto-start gives up on an issue whose retry died too, so it does that once (#303). */
export const GIVE_UP_MARKER = '<!-- auto-start:gave-up -->';
/** Posted when the maintainer restarts a handed-off issue (`/retry`, #539): planRetries treats it like a new fire. */
export const RESET_MARKER = '<!-- auto-start:reset -->';
/** Added to every hand-off comment: what the maintainer can reply (#539). */
export const RESTART_HINT = 'Reply `/retry` to try again, or `/split` to split it.';
/** Asks the split agent (.github/workflows/split-issue.yml) to split an issue into smaller ones (#303). */
export const SPLIT_LABEL = 'needs-split';
/** On the issues the split agent made: one whose retry dies too goes to the maintainer, not split again. */
export const SPLIT_PART_LABEL = 'split-part';
/** Hidden in the comment auto-start posts when it hands a ready XL issue to the split agent (#560). */
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
  /** Labelled `needs-info`: the agent stopped on a question (#423). */
  readonly needsInfo: boolean;
  /** Labelled `needs-split`: waiting for the split agent, no implement session (#486). */
  readonly needsSplit: boolean;
  readonly autoAgent: boolean;
  /** Labelled `area:infra` (or Area `infra`): startable without a milestone (#225). */
  readonly infra: boolean;
  /** Feature work (isFeatureWork): not started during the feature freeze (#84). */
  readonly feature: boolean;
  readonly size: string | undefined;
  /** Has a `size:*` label (Board sync copies and removes it); without one, a Size came from the board alone (#560). */
  readonly sizeLabelled?: boolean;
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
  /** Startable but sized XL: labelled `needs-split` for the split agent instead (#560). */
  readonly split: number[];
  /** Every other in-scope `ready-for-agent` issue not started, with why (#560). */
  readonly skips: Skip[];
}

/** An issue auto-start didn't start this run, and why (#560). */
export interface Skip {
  readonly issue: number;
  readonly reason: string;
}

export interface StartOptions {
  readonly defaultBranch?: string;
  /** AUTO_STACK: also start issues whose blockers are all in open PRs on one chain. */
  readonly stack?: boolean;
  readonly cap?: number;
  /** FEATURE_FREEZE: don't start feature work (#84). */
  readonly freeze?: boolean;
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
 * number; capped so at most `cap` `auto-agent` issues are In progress. Parked ones (`needs-info`,
 * `needs-you`, `needs-split` (#486), `hold`) have no live session, so they keep their claim but use no slot (#423).
 * Look-ahead may fill at most `cap − 1` slots (at least 1, so `cap` 1 isn't starved), counting
 * look-ahead issues already running; the current milestone and infra can use every slot. With
 * `freeze` on (the feature freeze, #84), feature work doesn't start.
 * A startable issue sized XL goes to `split` instead (the split agent, #560), using no slot. Every
 * other `ready-for-agent` issue in scope (current and next milestone, infra, game work with no
 * milestone) that isn't started or split gets one line in `skips` saying why (#560).
 */
export function planStarts(
  issues: readonly StartIssue[],
  prs: readonly OpenPr[],
  order: readonly number[],
  { defaultBranch = 'main', stack = false, cap = MAX_AGENTS, freeze = false }: StartOptions = {},
): StartPlan {
  const running = issues.filter((i) => isRunning(i));
  const slots = Math.max(0, cap - running.length);
  const lookRunning = running.filter((i) => order[1] !== undefined && i.milestone === order[1]).length;
  const lookCap = Math.max(1, cap - 1);
  let lookSlots = Math.max(0, lookCap - lookRunning);
  // Why an in-scope issue can't start at all, before its blockers and Size are looked at.
  const notEligible = (i: StartIssue): string | undefined => {
    const parked = (
      [
        [i.hold, HOLD_LABEL],
        [i.needsInfo, NEEDS_INFO_LABEL],
        [i.needsYou, NEEDS_YOU_LABEL],
        [i.needsSplit, SPLIT_LABEL],
      ] as const
    ).flatMap(([on, label]) => (on ? [`\`${label}\``] : []));
    if (parked.length) return `parked (${parked.join(', ')})`;
    if (i.assigned) return 'assigned';
    const open = prs.find((pr) => pr.issues.includes(i.number));
    if (open) return `open PR (${open.head})`;
    if (!(i.status === undefined || i.status === 'Backlog' || i.status === 'Ready')) return `card is ${i.status}`;
    if (freeze && i.feature) return 'feature freeze';
    return undefined;
  };
  const candidates = (inScope: (i: StartIssue) => boolean) => {
    const starts: { issue: StartIssue; start: Start }[] = [];
    const noSize: number[] = [];
    const split: number[] = [];
    const skips: Skip[] = [];
    for (const i of issues.filter((i) => inScope(i) && i.labelled && !i.tracker)) {
      const skip = (reason: string) => skips.push({ issue: i.number, reason });
      const why = notEligible(i);
      if (why) {
        skip(why);
        continue;
      }
      const base = i.blockedBy.length && !stack ? null : stackBase(i.blockedBy, prs, defaultBranch);
      const model = i.size === undefined ? undefined : MODEL_BY_SIZE[i.size];
      if (base === null)
        skip(`blocked by ${i.blockedBy.map((b) => `#${b}`).join(', ')}${stack ? ' (not stackable)' : ''}`);
      else if (i.size === undefined) {
        noSize.push(i.number);
        skip('no Size');
      } else if (i.size === 'XL') split.push(i.number);
      else if (!model) skip(`Size ${i.size} is not XS–L`);
      else starts.push({ issue: i, start: { issue: i.number, base, model } });
    }
    return { starts, noSize, split, skips };
  };
  const inMilestone = (milestone: number | undefined) => (i: StartIssue) =>
    milestone !== undefined && i.milestone === milestone;
  const infra = candidates((i) => i.infra && i.milestone === null);
  const current = candidates(inMilestone(order[0]));
  const next = candidates(inMilestone(order[1]));
  const lookingAhead = !current.starts.length;
  const skips: Skip[] = [...infra.skips, ...current.skips, ...next.skips];
  for (const i of issues)
    if (i.milestone === null && !i.infra && i.labelled && !i.tracker)
      skips.push({ issue: i.number, reason: 'game work with no milestone' });
  const later = 'not in scope (later milestone; the current one has work)';
  if (!lookingAhead)
    for (const n of [...next.starts.map((s) => s.issue.number), ...next.split]) skips.push({ issue: n, reason: later });
  const plan = lookingAhead ? next : current;
  const ranked = [...infra.starts, ...plan.starts].sort(
    (a, b) => rank(a.issue.priority) - rank(b.issue.priority) || a.issue.number - b.issue.number,
  );
  const starts: Start[] = [];
  for (const s of ranked) {
    if (lookingAhead && s.issue.milestone !== null && lookSlots-- <= 0)
      skips.push({ issue: s.issue.number, reason: `no slot (look-ahead cap ${lookCap})` });
    else if (starts.length >= slots) skips.push({ issue: s.issue.number, reason: `no slot (cap ${cap})` });
    else starts.push(s.start);
  }
  return {
    starts,
    noSize: [...new Set([...infra.noSize, ...current.noSize, ...(lookingAhead ? next.noSize : [])])],
    split: [...new Set([...infra.split, ...current.split, ...(lookingAhead ? next.split : [])])],
    skips: skips.sort((a, b) => a.issue - b.issue),
  };
}

/**
 * The run-log line for a skipped issue (#560). A board Size with no `size:` label is named, so a
 * Size set on the board alone can be seen from the issue's side.
 */
export function skipLine(skip: Skip, issue?: Pick<StartIssue, 'size' | 'sizeLabelled'>): string {
  return `#${skip.issue}: not started: ${skip.reason}${sizeNote(issue)}`;
}

const sizeNote = (issue?: Pick<StartIssue, 'size' | 'sizeLabelled'>) =>
  issue?.size !== undefined && !issue.sizeLabelled ? ` (board Size ${issue.size}, no \`size:\` label)` : '';

/** The run-log line for an XL issue handed to the split agent (#560). */
export const splitLine = (issue: number, info?: Pick<StartIssue, 'size' | 'sizeLabelled'>) =>
  `#${issue}: Size XL, asking the split agent${sizeNote(info)}`;

/**
 * Hand a ready XL issue to the split agent (#560): `needs-split`, then a comment saying why (with
 * PROJECT_TOKEN, so .github/workflows/split-issue.yml runs). It waits parked; its parts start normally.
 */
export async function requestSplit(issue: number, token: string, fetchFn: Fetch = fetch): Promise<void> {
  // Label first: it keeps the issue out of the next run, so a failed comment can't post twice.
  await github(fetchFn, token, 'POST', `issues/${issue}/labels`, { labels: [SPLIT_LABEL] });
  await github(fetchFn, token, 'POST', `issues/${issue}/comments`, {
    body:
      `Auto-start doesn't start Size XL issues: they're too big for one session. It asked the split agent ` +
      `to split this one into smaller issues (\`${SPLIT_LABEL}\`, docs/agents/prompts/split.md).`,
  });
}

/**
 * An `auto-agent` issue with a live session: In progress and not parked on a question, the maintainer
 * (#423) or the split agent (#486).
 */
export const isRunning = (
  i: Pick<StartIssue, 'autoAgent' | 'status'> &
    Partial<Pick<StartIssue, 'needsInfo' | 'needsYou' | 'needsSplit' | 'hold'>>,
) => i.autoAgent && i.status === 'In progress' && !i.needsInfo && !i.needsYou && !i.needsSplit && !i.hold;

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

/** Feature work, which the feature freeze holds back (#84): `enhancement`, but not a `bug` and not infra. */
export function isFeatureWork(labels: readonly string[], infra: boolean): boolean {
  return labels.includes(ENHANCEMENT_LABEL) && !labels.includes(BUG_LABEL) && !infra;
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
  /** Made by the split agent (`split-part`): never split again (#303). */
  readonly splitPart?: boolean;
  /** Its latest comments, oldest first. */
  readonly comments: readonly RetryComment[];
  /** The open PR that closes it, with the times of its latest commit and comment. */
  readonly pr?: {
    readonly number: number;
    readonly head: string;
    readonly draft: boolean;
    readonly activity: readonly string[];
  };
}

/** An issue comment; `author` is the GitHub login, to tell the maintainer's replies from others (#539). */
export interface RetryComment {
  readonly body: string;
  readonly createdAt: string;
  readonly author?: string;
}

/** A dead implement session to fire again: the same model and base, continuing its branch and PR. */
export interface Retry extends Start {
  readonly branch?: string;
  readonly pr?: number;
  /** The retry died too (#303): instead of firing again, split the issue, or hand a split part to the maintainer. */
  readonly giveUp?: 'split' | 'handoff';
  /** Not dead: the agent stopped on a question, and the maintainer answered it (#319). */
  readonly resume?: boolean;
}

const RESET_MODEL = /<!-- auto-start:reset model=(\S+) -->/;
const FIRE_META = /<!-- auto-start:fire-meta model=(\S+) base=(\S+) -->/;

/** The comment auto-start posts after a fire: the fired marker, plus the model and base for a retry. */
export const firedComment = (start: Start, sessionUrl?: string) =>
  `Auto-start fired the ${start.model} implement task${sessionUrl ? `: ${sessionUrl}` : ''}.\n\n` +
  `${FIRED_MARKER}\n<!-- auto-start:fire-meta model=${start.model} base=${start.base} -->`;

/**
 * The implement sessions that died (#201): an `auto-agent` issue whose latest fired marker has no
 * done marker after it, with no issue comment and no commit or comment on its PR for `idleMs`.
 * Never `hold`, `needs-you`, `needs-info` (an intentional stop) or a ready PR (the steward's).
 * A session gets MAX_FIRES fires since the latest done marker; after that it gives up, once (#303).
 * Also the answered questions (#319): a done marker after the latest fire, no ready PR, `needs-info`
 * off and a maintainer comment after it is resumed at once (`resume`), with a fresh fire count.
 */
export function planRetries(issues: readonly RetryIssue[], now: number, idleMs = RETRY_IDLE_MS): Retry[] {
  const retries: Retry[] = [];
  for (const i of issues) {
    if (!i.autoAgent || i.hold || i.needsYou || i.needsInfo || (i.pr && !i.pr.draft)) continue;
    const firedAt = i.comments.findLastIndex((c) => c.body.includes(FIRED_MARKER));
    if (firedAt < 0) continue;
    // A reset (#539) is a maintainer's restart: it counts as a new fire, and fires at once.
    const resetAt = i.comments.findLastIndex((c) => c.body.includes(RESET_MARKER));
    const sinceFire = i.comments.slice(Math.max(firedAt, resetAt));
    if (sinceFire.some((c) => c.body.includes(GIVE_UP_MARKER))) continue;
    const meta = FIRE_META.exec(i.comments[firedAt]!.body);
    const resetModel = resetAt > firedAt ? RESET_MODEL.exec(i.comments[resetAt]!.body)?.[1] : undefined;
    const model = resetModel ?? meta?.[1];
    if (model !== 'sonnet' && model !== 'opus') continue;
    const target: Retry = {
      issue: i.number,
      base: meta![2]!,
      model,
      ...(i.pr ? { branch: i.pr.head, pr: i.pr.number } : {}),
    };
    if (resetAt > firedAt) {
      retries.push(target);
      continue;
    }
    if (sinceFire.some((c) => c.body.includes(DONE_MARKER))) {
      // The session ended on purpose. With no ready PR (skipped above), that was a `needs-info`
      // question (#319): once it's off and the maintainer commented after the done marker, fire again
      // at once. Comments with a hidden marker are automation's, not an answer.
      const doneAt = i.comments.findLastIndex((c) => c.body.includes(DONE_MARKER));
      if (i.comments.slice(doneAt + 1).some((c) => !c.body.includes('<!--'))) retries.push({ ...target, resume: true });
      continue;
    }
    const times = [...i.comments.map((c) => c.createdAt), ...(i.pr?.activity ?? [])].map(Date.parse);
    const idle = now - Math.max(...times);
    if (Number.isNaN(idle) || idle < idleMs) continue;
    const lastDone = Math.max(
      i.comments.findLastIndex((c) => c.body.includes(DONE_MARKER)),
      resetAt,
    );
    const fires = i.comments.slice(lastDone + 1).filter((c) => c.body.includes(FIRED_MARKER)).length;
    retries.push({
      ...target,
      ...(fires >= MAX_FIRES ? { giveUp: i.splitPart ? ('handoff' as const) : ('split' as const) } : {}),
    });
  }
  return retries;
}

/** The fire `text` for a retry: `fireText` plus the branch and PR to continue, when they exist. */
export const retryText = (retry: Retry) =>
  fireText(retry) +
  (retry.resume ? '\nResume: your question was answered on the issue' : '') +
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

/**
 * Give up on an issue whose retry died too (#303), with the give-up marker so it happens once.
 * `split`: label it `needs-split`, which starts the split agent (the label goes on with
 * PROJECT_TOKEN, so the workflow runs). `handoff`: a split part, so `needs-you` (which pushes).
 * The claim stays: the split agent closes the issue, or the maintainer decides.
 */
export async function giveUpIssue(retry: Retry, token: string, fetchFn: Fetch = fetch): Promise<void> {
  const tries = `Its implement session died ${MAX_FIRES} times without finishing (most likely out of tokens)`;
  const body =
    retry.giveUp === 'handoff'
      ? `${HANDOFF_MARKER}\n${tries}, and it is already a split part, so auto-start hands it to you. ` +
        `Split it or do it yourself, then remove \`${NEEDS_YOU_LABEL}\`. ${RESTART_HINT}`
      : `${tries}: auto-start asked the split agent to split it into smaller issues (\`${SPLIT_LABEL}\`, ` +
        'docs/agents/prompts/split.md).';
  await github(fetchFn, token, 'POST', `issues/${retry.issue}/comments`, { body: `${body}\n\n${GIVE_UP_MARKER}` });
  await github(fetchFn, token, 'POST', `issues/${retry.issue}/labels`, {
    labels: [retry.giveUp === 'handoff' ? NEEDS_YOU_LABEL : SPLIT_LABEL],
  });
}

/** What a maintainer's reply asks for (#539): `/retry` (also `retry`, `try again`), `/retry opus`, `/split`. */
export interface RestartCommand {
  readonly model?: Model;
  readonly split?: true;
}

/** Read a whole comment as a restart command; anything else, including a command inside a longer text, is `undefined`. */
export function parseRestartCommand(body: string): RestartCommand | undefined {
  const text = body.trim().toLowerCase().replace(/\s+/g, ' ');
  if (text === '/retry' || text === 'retry' || text === 'try again') return {};
  if (text === '/retry opus') return { model: 'opus' };
  if (text === '/split') return { split: true };
  return undefined;
}

/** A handed-off issue the maintainer restarted (#539). */
export interface Restart {
  readonly issue: number;
  readonly split: boolean;
  readonly model?: Model;
}

/**
 * The `needs-you` issues claimed by auto-start whose maintainer replied with a restart command after
 * the latest hand-off (#539), like `/approve` on a PR. A maintainer's reply is by the maintainer, with no
 * hidden marker and no *Generated by Claude Code* footer: agents post as the maintainer, but sign.
 */
export function planRestarts(issues: readonly RetryIssue[]): Restart[] {
  const restarts: Restart[] = [];
  for (const i of issues) {
    if (!i.autoAgent || !i.needsYou || i.hold) continue;
    const handedAt = i.comments.findLastIndex((c) => c.body.includes(HANDOFF_MARKER));
    if (handedAt < 0) continue; // needs-you set by hand: an old "try again" in the thread isn't a restart
    const reply = i.comments
      .slice(handedAt + 1)
      .filter(
        (c) => c.author === MAINTAINER && !c.body.includes('<!--') && !c.body.includes('Generated by [Claude Code]'),
      )
      .map((c) => parseRestartCommand(c.body))
      .findLast((command) => command !== undefined);
    if (reply)
      restarts.push({ issue: i.number, split: reply.split === true, ...(reply.model ? { model: reply.model } : {}) });
  }
  return restarts;
}

/**
 * Carry out a restart (#539). `/retry`: a reset marker comment (planRetries fires it on the next run),
 * then `needs-you` off. `/split`: the give-up marker and `needs-split`, as when a retry dies twice.
 */
export async function applyRestart(restart: Restart, token: string, fetchFn: Fetch = fetch): Promise<void> {
  const path = `issues/${restart.issue}`;
  if (restart.split) {
    await github(fetchFn, token, 'POST', `${path}/comments`, {
      body: `Splitting on your request: asked the split agent (\`${SPLIT_LABEL}\`).\n\n${GIVE_UP_MARKER}`,
    });
    await github(fetchFn, token, 'POST', `${path}/labels`, { labels: [SPLIT_LABEL] });
  } else {
    const model = restart.model ? `\n<!-- auto-start:reset model=${restart.model} -->` : '';
    await github(fetchFn, token, 'POST', `${path}/comments`, {
      body: `Restarting on your request${restart.model ? ` with ${restart.model}` : ''}: auto-start fires it on its next run.\n\n${RESET_MARKER}${model}`,
    });
  }
  await github(fetchFn, token, 'DELETE', `${path}/labels/${NEEDS_YOU_LABEL}`);
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
      `implement-${model} routine at claude.ai/code/routines, then remove \`${NEEDS_YOU_LABEL}\` to start it again. ${RESTART_HINT}`,
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

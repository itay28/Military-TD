import { pathToFileURL } from 'node:url';
import { classifyFireError, fireRoutine, github, type Fetch, type Routine } from './auto-start.ts';
import { currentMilestone, graphql, milestoneOrder } from './board-sync.ts';
import { ApiMeter, softFail } from './rate-limit.ts';
import { markerFor } from './failure-report.ts';
import { isMilestoneDone, releaseVersion } from './milestone-report.ts';

// The PR steward (docs/agents/issue-tracker.md → PR steward, ADR-0008): run by
// .github/workflows/pr-steward.yml after CI and the CI review, on PR comments and reviews, on a
// push to main and on a schedule. Each run reconciles every open PR: fire a steward round (a
// cloud task that fixes conflicts, CI, review findings and comments), merge the base into a PR
// that is only behind, hand a stuck PR to the maintainer, or squash-merge a finished one.
// `decide` is pure; `act` and the CLI at the bottom do the writing.

/** Starts the CI review's comment (.github/workflows/claude-code-review.yml). */
export const REVIEW_HEADING = '## Code review (mattpocock-skills:code-review)';
/** Ends a CI review with no findings on either axis: nothing to answer, so no steward round (#303). */
export const CLEAN_REVIEW_MARKER = '<!-- code-review:clean -->';
/**
 * Posted by the Action when it asks for a missing CI review (#209), with the head commit it asked
 * for: a PR marked ready while it conflicts never starts the review workflow, as GitHub runs no
 * `pull_request` workflow on a conflicted PR. One request per head commit, so a failing review job
 * doesn't loop.
 */
export const REVIEW_REQUEST_MARKER = '<!-- pr-steward:review-requested';
export const reviewRequestMarker = (sha: string) => `${REVIEW_REQUEST_MARKER} sha=${sha} -->`;
/** Re-runs the CI review (.github/workflows/claude-code-review.yml). */
const REVIEW_AGAIN_LABEL = 'review-again';
/** Posted by the Action when it fires a round. */
export const ROUND_MARKER = '<!-- pr-steward:round -->';
/** Posted by the steward (or implement) agent when it has finished a round. */
export const DONE_MARKER = '<!-- pr-steward:done -->';

const ROUND_META = '<!-- pr-steward:round-meta';
/** The hidden line under a round marker: why the round fired, and the base branch's head then (#183). */
export const roundMeta = (reasons: readonly Reason[], baseSha: string) =>
  `${ROUND_META} reasons=${reasons.join(',')} base=${baseSha} -->`;
const parseRoundMeta = (body: string) => {
  const m = new RegExp(`${ROUND_META} reasons=([\\w,]*) base=(\\S+) -->`).exec(body);
  return m ? { reasons: m[1]!.split(','), base: m[2]! } : null;
};

/**
 * Whether a round (its marker) finished: a done marker came after it, before the next round
 * marker. A round that didn't died, most likely out of tokens; it's retried (#200), and only the
 * first dead round is free (#303).
 */
function finishedRound(comments: readonly PrComment[]): (round: PrComment) => boolean {
  const times = (marker: string) => comments.filter((c) => c.body.includes(marker)).map((c) => Date.parse(c.createdAt));
  const rounds = times(ROUND_MARKER);
  const dones = times(DONE_MARKER);
  return (round) => {
    const t = Date.parse(round.createdAt);
    const next = Math.min(...rounds.filter((r) => r > t));
    return dones.some((d) => d > t && d < next);
  };
}

/**
 * Rounds that count toward MAX_ROUNDS among `rounds` (round markers): finished ones, and every dead
 * one after the first, so a PR whose rounds keep dying is handed off (#303). A
 * round fired only for a conflict is free too: conflicts come from the base moving, and one the
 * agent can't resolve hands off at once (see `unresolvedConflict`). A marker without a meta line counts.
 */
function countedRounds(rounds: readonly PrComment[], finished: (round: PrComment) => boolean): number {
  const counted = rounds.filter((r) => {
    const meta = parseRoundMeta(r.body);
    return finished(r) && !(meta && meta.reasons.length === 1 && meta.reasons[0] === 'conflict');
  }).length;
  const dead = rounds.filter((r) => !finished(r)).length;
  return counted + Math.max(0, dead - 1);
}

/** Whether the latest round finished, was fired for a conflict on this same base, and the conflict is still there. */
function unresolvedConflict(
  rounds: readonly PrComment[],
  baseSha: string,
  finished: (round: PrComment) => boolean,
): boolean {
  const latest = rounds.at(-1);
  const meta = latest && finished(latest) ? parseRoundMeta(latest.body) : null;
  return !!meta && meta.reasons.includes('conflict') && meta.base === baseSha;
}
/** Posted by the Action when it hands a PR off. */
export const STUCK_MARKER = '<!-- pr-steward:stuck -->';
/** Posted next to the stuck marker when the hand-off asks for the maintainer's `/approve` (#206). */
/** Posted when the steward merges the base in because mergeability stayed UNKNOWN (#487). */
export const UNKNOWN_UPDATE_MARKER = '<!-- pr-steward:unknown-update -->';
/** How long GitHub may report mergeability as UNKNOWN before the steward acts (#487). */
const UNKNOWN_MS = 60 * 60 * 1000;
export const APPROVAL_MARKER = '<!-- pr-steward:approval -->';
/** A maintainer comment starting with this lets a PR that touches a critical path merge. */
const APPROVE_COMMAND = /^\/approve\b/;
/**
 * Changes that are the maintainer's call, not an agent's (#206): the pipeline and the checks that
 * gate merging (so an agent can't loosen its own leash), architecture decisions, dependencies and
 * licences. A PR touching one merges only after a maintainer `/approve`. Entries ending in `/` are
 * folders; the rest are exact paths. A new script is gated until it's added to UNGATED_PATHS.
 */
export const CRITICAL_PATHS = [
  '.github/',
  '.claude/',
  '.husky/',
  'CLAUDE.md',
  'docs/agents/',
  'docs/adr/',
  'scripts/',
  'release-please-config.json',
  '.release-please-manifest.json',
  'eslint.config.js',
  'tsconfig.json',
  'vite.config.ts',
  'playwright.config.ts',
  'package.json',
  'package-lock.json',
  'assets/manifest.json',
  'LICENSE',
] as const;
/** The scripts the game uses, so feature PRs that touch them don't wait. */
const UNGATED_PATHS = ['scripts/scenario.ts', 'scripts/itch-build.ts'];

/** The changed files that are on a critical path, in their order. */
export const criticalFiles = (files: readonly string[]): string[] =>
  files.filter(
    (f) => !UNGATED_PATHS.includes(f) && CRITICAL_PATHS.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p)),
  );
/** The footers agents add to what they post; they tell them apart from the maintainer, whose identity they use. */
const AGENT_FOOTERS = ['Generated by [Claude Code]', 'Generated with [Claude Code]'];
const HOLD_LABEL = 'hold';
/** release-please's branch: its PR only bumps the version and changelog (docs/agents/releasing.md). */
const RELEASE_BRANCH = 'release-please--';
/** release-please's PR title: `chore(main): release 0.2.0`. */
const RELEASE_TITLE = /^chore\(main\): release (\d+\.\d+\.\d+)$/;
/** The milestone report PR's branch (scripts/milestone-report.ts): `chore/release-0.2.0`. */
const REPORT_BRANCH = /^chore\/release-(\d+\.\d+\.\d+)$/;
const NEEDS_YOU_LABEL = 'needs-you';
/** The approval hand-off's own label (#417), so "approve this" and "the steward gave up" read apart. */
const NEEDS_APPROVAL_LABEL = 'needs-approval';
/** The labels a hand-off leaves: the PR waits on the maintainer while it has one. */
const HAND_OFF_LABELS = [NEEDS_YOU_LABEL, NEEDS_APPROVAL_LABEL] as const;
/** Rounds a PR gets before it's handed off; a maintainer comment gives it fresh ones (#165). */
export const MAX_ROUNDS = 2;
/** A round with no done marker after this long has died (e.g. its session hit a usage limit) and is retried, not counted (#200). Real rounds take minutes (#196). */
const ROUND_TIMEOUT_MS = 60 * 60 * 1000;
/** A draft that is red and has had no commit or comment for this long is stranded, and gets a round (#326). */
export const DRAFT_IDLE_MS = 60 * 60 * 1000;
/** Checks that report on bookkeeping, not on the PR's code; the CI review is judged by its comment. */
const IGNORED_CHECKS = ['board-sync', 'release-issue', 'claude-review', 'pr-steward'];
const MAINTAINER_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];

export interface PrComment {
  readonly author: string;
  readonly bot: boolean;
  readonly association: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface Check {
  readonly name: string;
  readonly state: 'pending' | 'success' | 'failure' | 'cancelled';
  /** When a check run finished (ISO time); orders re-runs of the same check. */
  readonly completedAt?: string;
}

export interface MilestoneRef {
  readonly number: number;
  readonly title: string;
}

/** The milestone agents work on, with the open milestones ranked after it. */
export interface CurrentMilestone extends MilestoneRef {
  readonly after: readonly number[];
  /** Every issue in it is closed except its open release issue (isMilestoneDone in milestone-report.ts). */
  readonly done: boolean;
}

/**
 * One result per check name (#179): a re-triggered check leaves its older run on the commit, often
 * cancelled. A check is pending while any run is; otherwise its latest finished run counts, skipping
 * cancelled runs when another run finished. A check whose runs were all cancelled counts as failing.
 */
export function currentChecks(checks: readonly Check[]): { name: string; state: 'pending' | 'success' | 'failure' }[] {
  const byName = new Map<string, Check[]>();
  for (const c of checks) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
  return [...byName].map(([name, runs]) => {
    if (runs.some((r) => r.state === 'pending')) return { name, state: 'pending' as const };
    const latest = runs
      .filter((r) => r.state !== 'cancelled')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
    return { name, state: latest ? (latest.state as 'success' | 'failure') : ('failure' as const) };
  });
}

/** An open PR, with what the steward reads. */
export interface StewardPr {
  /** GraphQL node id, for marking a draft ready. */
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly isDraft: boolean;
  readonly fork: boolean;
  readonly base: string;
  /** The base branch's head commit. */
  readonly baseSha: string;
  readonly head: string;
  readonly headSha: string;
  readonly labels: readonly string[];
  readonly mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  /** Behind its base branch (GitHub's merge state `BEHIND`). */
  readonly behind: boolean;
  /** Checks on the head commit. */
  readonly checks: readonly Check[];
  readonly unresolvedThreads: number;
  /** The issues it closes: still blocked by open issues, or waiting on an answer (`needs-info`). */
  readonly closes: readonly {
    readonly number: number;
    readonly blocked: boolean;
    readonly needsInfo: boolean;
    readonly milestone?: MilestoneRef | null;
  }[];
  /** Changed paths; null when the PR has more files than were read. */
  readonly files: readonly string[] | null;
  /** Renamed files: the new path, and the old one (null when it couldn't be read, so it's gated: #206, #417). */
  readonly renamed: readonly Rename[];
  /** When the latest commit that isn't a merge was made: an approval must come after it. */
  readonly codeCommittedAt: string | null;
  /** When the latest commit of any kind was made (a draft's activity, #326). */
  readonly lastCommitAt: string | null;
  /** Conversation comments, oldest first. */
  readonly comments: readonly PrComment[];
}

/** Why a round is needed, in the order they're listed. */
export type Reason = 'conflict' | 'ci' | 'review' | 'comment' | 'threads';

/**
 * What a `wait` waits on, so its status label (#419) doesn't depend on the wording of `why`:
 * an agent or automation (`mergeability`, `round`, `checks`, `review`), the maintainer
 * (`needs-info`, `release`: a release PR to merge by hand, or a broken report PR), CI on main
 * (`main-ci`), or something queued ahead of it (`milestone`, `stacked`, `blocked`).
 */
export type WaitCause =
  | 'mergeability'
  | 'round'
  | 'checks'
  | 'review'
  | 'stacked'
  | 'blocked'
  | 'needs-info'
  | 'milestone'
  | 'main-ci'
  | 'release';

export type Decision =
  | { readonly kind: 'skip'; readonly why: string }
  | { readonly kind: 'wait'; readonly cause: WaitCause; readonly why: string }
  /** `unknown`: mergeability stayed UNKNOWN for over an hour (#487), so a marker comment goes with the merge. */
  | { readonly kind: 'update'; readonly unknown?: boolean }
  /** A draft whose steward round ended green (#326): mark it ready for review. */
  | { readonly kind: 'ready' }
  /** No CI review ever ran on this PR: add `review-again` to start one (#209). */
  | { readonly kind: 'review' }
  | {
      readonly kind: 'steward';
      readonly reasons: readonly Reason[];
      readonly round: number;
      /** The latest round died without its done marker; this one fires it again (#200). */
      readonly retry: boolean;
      /** A maintainer comment restarted a handed-off PR: the hand-off labels to remove. */
      readonly clearHandOff: readonly string[];
    }
  | {
      readonly kind: 'stuck';
      readonly reasons: readonly Reason[];
      /** A conflict round didn't resolve the conflict. */
      readonly conflict?: boolean;
      /** Mergeability is still UNKNOWN an hour after the steward merged the base in (#487). */
      readonly unknown?: boolean;
    }
  | { readonly kind: 'merge' }
  /** Ready to merge, but it touches a critical path (#206): hand off for the maintainer's `/approve`. */
  | { readonly kind: 'approval'; readonly paths: readonly string[] };

/** CI on the default branch is red (#220), with the open *Failure report* issue for it, if any. */
export interface MainRed {
  readonly issue: number | null;
}

/** The CI workflow's jobs; a failed one on the default branch's head means main is red. */
const MAIN_CI_JOBS = ['ci', 'e2e'];
export const mainCiRed = (checks: readonly Check[]): boolean =>
  checks.some((c) => MAIN_CI_JOBS.includes(c.name) && c.state === 'failure');

/** From main's head checks and the open bugs: red, with the CI failure report (failure-report.ts) if open. */
export const mainRedFrom = (
  checks: readonly Check[],
  openBugs: readonly { readonly number: number; readonly body: string }[],
): MainRed | null =>
  mainCiRed(checks) ? { issue: openBugs.find((i) => i.body.includes(markerFor('CI')))?.number ?? null } : null;

/** A merge waits while main is red, unless the PR closes the issue that tracks it: that PR is the fix. */
function heldByRedMain(pr: StewardPr, decision: Decision, mainRed: MainRed | null): Decision {
  if (decision.kind !== 'merge' || !mainRed) return decision;
  if (mainRed.issue !== null && pr.closes.some((i) => i.number === mainRed.issue)) return decision;
  const issue = mainRed.issue === null ? '' : ` (#${mainRed.issue})`;
  return { kind: 'wait', cause: 'main-ci', why: `main CI is failing${issue}: merges once main is green` };
}

const isMaintainer = (c: PrComment) =>
  !c.bot &&
  MAINTAINER_ASSOCIATIONS.includes(c.association) &&
  !AGENT_FOOTERS.some((footer) => c.body.includes(footer)) &&
  !c.body.includes('<!-- pr-steward:');
const isApproval = (c: PrComment) => isMaintainer(c) && APPROVE_COMMAND.test(c.body.trim());

/**
 * What to do with one open PR. In order: skip drafts, forks, `hold`, and `needs-you` PRs the
 * maintainer hasn't answered; hand release and milestone report PRs to decideRelease / decideReport; wait while mergeability is unknown or a round is in flight; fire a
 * round for a conflict, a failed check, an unanswered CI review or maintainer comment, or
 * unresolved threads (hand off as stuck after MAX_ROUNDS, or at once when a round left a conflict
 * on the same base); update a PR that is only behind; wait
 * for running checks and the CI review, requesting a review that never ran (#209); then merge, if
 * it targets the default branch, no issue it closes is blocked or waiting on an answer, and none
 * is in a later milestone than `current` (#180), and, when it touches a critical path, a
 * maintainer `/approve` came after the latest round (#206). While `mainRed`, no merge happens except
 * the fix's (#220).
 */
export function decide(
  pr: StewardPr,
  now: Date,
  defaultBranch = 'main',
  current: CurrentMilestone | null = null,
  mainRed: MainRed | null = null,
): Decision {
  return heldByRedMain(pr, decideIgnoringMain(pr, now, defaultBranch, current), mainRed);
}

/** The checks that count toward a PR's state: the latest run of each, minus the ones that never gate it. */
const relevantChecks = (pr: StewardPr) => currentChecks(pr.checks).filter((c) => !IGNORED_CHECKS.includes(c.name));

/** The time of the latest comment matching `test`, or 0. */
const lastCommentAt = (pr: StewardPr, test: (c: PrComment) => boolean) =>
  Math.max(0, ...pr.comments.filter(test).map((c) => Date.parse(c.createdAt)));

/** Every check that counts passed, none is still running, and the PR merges cleanly. */
const checksGreen = (pr: StewardPr) => {
  const relevant = relevantChecks(pr);
  return (
    relevant.length > 0 &&
    relevant.every((c) => c.state === 'success') &&
    !currentChecks(pr.checks).some((c) => c.state === 'pending') &&
    pr.mergeable === 'MERGEABLE'
  );
};

/**
 * The whole draft rule (#326), in one place: a draft never reaches review, update or merge. It is
 * left alone while someone may be working on it. It is `stranded` when a check fails and nothing
 * was committed or commented for DRAFT_IDLE_MS: the normal flow then fires a `ci` round, and only
 * `ci` (decideIgnoringMain keeps no other reason for a draft). A draft whose steward round ended
 * with everything green is marked ready.
 */
function draftStage(pr: StewardPr, now: Date): Decision | 'stranded' {
  const skip: Decision = { kind: 'skip', why: 'draft' };
  if (HAND_OFF_LABELS.some((l) => pr.labels.includes(l))) return skip;
  const lastRound = lastCommentAt(pr, (c) => c.body.includes(ROUND_MARKER));
  const lastDone = lastCommentAt(pr, (c) => c.body.includes(DONE_MARKER));
  if (lastRound > 0 && lastDone >= lastRound && checksGreen(pr)) return { kind: 'ready' };
  const lastActivity = Math.max(
    lastCommentAt(pr, () => true),
    pr.lastCommitAt ? Date.parse(pr.lastCommitAt) : 0,
  );
  const red = relevantChecks(pr).some((c) => c.state === 'failure');
  return red && now.getTime() - lastActivity >= DRAFT_IDLE_MS ? 'stranded' : skip;
}

function decideIgnoringMain(
  pr: StewardPr,
  now: Date,
  defaultBranch: string,
  current: CurrentMilestone | null,
): Decision {
  if (pr.fork) return { kind: 'skip', why: 'fork' };
  if (pr.labels.includes(HOLD_LABEL)) return { kind: 'skip', why: HOLD_LABEL };
  if (pr.isDraft) {
    const stage = draftStage(pr, now);
    if (stage !== 'stranded') return stage;
  }
  if (pr.head.startsWith(RELEASE_BRANCH)) return decideRelease(pr, current);
  const report = REPORT_BRANCH.exec(pr.head)?.[1];
  if (report) return decideReport(pr, current, report);
  const checks = currentChecks(pr.checks);

  const last = (test: (c: PrComment) => boolean) => lastCommentAt(pr, test);
  const lastMaintainer = last(isMaintainer);
  const lastDone = last((c) => c.body.includes(DONE_MARKER));
  const lastRound = last((c) => c.body.includes(ROUND_MARKER));
  const lastReview = last((c) => c.body.startsWith(REVIEW_HEADING));
  // A review with no findings needs no answer, so it starts no round (#303).
  const lastFindings = last((c) => c.body.startsWith(REVIEW_HEADING) && !c.body.includes(CLEAN_REVIEW_MARKER));

  const clearHandOff = HAND_OFF_LABELS.filter((l) => pr.labels.includes(l));
  if (clearHandOff.length) {
    const lastStuck = last((c) => c.body.includes(STUCK_MARKER));
    if (!lastStuck || lastMaintainer <= lastStuck)
      return { kind: 'skip', why: 'handed off, waiting on the maintainer' };
  }
  if (pr.mergeable === 'UNKNOWN') {
    // Waiting forever hides a PR GitHub never recomputes (#487): after an hour, merge the base in
    // (that makes GitHub compute it again), and after another hour hand it off.
    const lastActivity = Math.max(
      lastCommentAt(pr, () => true),
      pr.lastCommitAt ? Date.parse(pr.lastCommitAt) : 0,
    );
    if (now.getTime() - lastActivity < UNKNOWN_MS)
      return { kind: 'wait', cause: 'mergeability', why: 'GitHub is computing mergeability' };
    const updated = last((c) => c.body.includes(UNKNOWN_UPDATE_MARKER)) > lastMaintainer;
    return pr.behind && !updated ? { kind: 'update', unknown: true } : { kind: 'stuck', reasons: [], unknown: true };
  }
  if (lastRound > lastDone && now.getTime() - lastRound < ROUND_TIMEOUT_MS)
    return { kind: 'wait', cause: 'round', why: 'a steward round is in flight' };

  const relevant = relevantChecks(pr);
  const conflict = pr.mergeable === 'CONFLICTING';
  const pending =
    relevant.some((c) => c.state === 'pending') ||
    checks.some((c) => c.name === 'claude-review' && c.state === 'pending');
  // Running checks may still fail or post a review: wait so one round handles it all, unless
  // there's a conflict, which no check result changes.
  if (pending && !conflict) return { kind: 'wait', cause: 'checks', why: 'checks are running' };

  const reasons: Reason[] = [];
  if (conflict) reasons.push('conflict');
  if (relevant.some((c) => c.state === 'failure')) reasons.push('ci');
  if (lastFindings > lastDone && lastFindings === lastReview) reasons.push('review');
  if (last((c) => isMaintainer(c) && !isApproval(c)) > lastDone) reasons.push('comment');
  if (pr.unresolvedThreads > 0) reasons.push('threads');
  // A draft only ever gets a `ci` round (see draftStage).
  if (pr.isDraft) reasons.splice(0, reasons.length, ...reasons.filter((r) => r === 'ci'));
  if (reasons.length) {
    const since = pr.comments.filter((c) => c.body.includes(ROUND_MARKER) && Date.parse(c.createdAt) > lastMaintainer);
    const finished = finishedRound(pr.comments);
    if (conflict && unresolvedConflict(since, pr.baseSha, finished))
      return { kind: 'stuck', reasons: ['conflict'], conflict: true };
    const used = countedRounds(since, finished);
    const latest = since.at(-1);
    return used >= MAX_ROUNDS
      ? { kind: 'stuck', reasons }
      : { kind: 'steward', reasons, round: used + 1, retry: !!latest && !finished(latest), clearHandOff };
  }
  if (pr.isDraft) return { kind: 'skip', why: 'draft' };
  if (pr.behind) return { kind: 'update' };
  if (!lastReview)
    return pr.comments.some((c) => c.body.includes(reviewRequestMarker(pr.headSha)))
      ? {
          kind: 'wait',
          cause: 'review',
          why: 'no CI review yet (requested for this commit; add `review-again` to ask again)',
        }
      : { kind: 'review' };
  if (pr.base !== defaultBranch)
    return { kind: 'wait', cause: 'stacked', why: `stacked on ${pr.base}: merges after its parent` };
  const held = pr.closes.find((i) => i.blocked || i.needsInfo);
  if (held)
    return {
      kind: 'wait',
      cause: held.blocked ? 'blocked' : 'needs-info',
      why: held.blocked
        ? `#${held.number} is still blocked by open issues`
        : `#${held.number} has an open question (needs-info)`,
    };
  // Look-ahead work (auto-start's next milestone) merges only once the current milestone has shipped.
  const ahead = current && pr.closes.find((i) => i.milestone && current.after.includes(i.milestone.number));
  if (ahead && current)
    return {
      kind: 'wait',
      cause: 'milestone',
      why: `#${ahead.number} is in ${ahead.milestone!.title}: merges after ${current.title} ships`,
    };
  const paths = [
    ...(pr.files ? criticalFiles(pr.files) : ['(more files than were read)']),
    ...renamedCritical(pr.renamed),
  ];
  const approvedAfter = Math.max(lastRound, pr.codeCommittedAt ? Date.parse(pr.codeCommittedAt) : 0);
  if (paths.length && last(isApproval) <= approvedAfter) return { kind: 'approval', paths };
  return { kind: 'merge' };
}

/** release-please reads `Release-As` only from the commit's last paragraph (docs/agents/releasing.md). */
const lastParagraph = (text: string) =>
  text
    .trim()
    .split(/\n\s*\n/)
    .at(-1)
    ?.trim();

/** The version release-please's PR or the milestone report PR ships, against the current milestone's. */
function wrongVersion(
  name: string,
  version: string,
  current: CurrentMilestone | null,
  cause: WaitCause,
): Decision | null {
  if (current && version === releaseVersion(current.title)) return null;
  return {
    kind: 'wait',
    cause,
    why: `${name} ${version}: ${current ? `ships with ${current.title}` : 'no open milestone'}; merge it by hand to release now`,
  };
}

/** A generated PR merges once its checks are green (some must have run), and is brought up to date when behind. */
function whenGreen(pr: StewardPr, name: string, unmergeable: string): Decision {
  const relevant = relevantChecks(pr);
  if (pr.mergeable !== 'MERGEABLE') return { kind: 'wait', cause: 'mergeability', why: `${name}: ${unmergeable}` };
  if (!relevant.length) return { kind: 'wait', cause: 'checks', why: `${name}: no checks ran on it` };
  if (relevant.some((c) => c.state !== 'success'))
    return { kind: 'wait', cause: 'checks', why: `${name}: checks running or failing` };
  if (pr.behind) return { kind: 'update' };
  return { kind: 'merge' };
}

/**
 * release-please's PR is generated, so no agent works on it and the CI review doesn't hold it. It
 * ships the current milestone only (#187): it merges when its version is the milestone's, so a
 * patch release waits for the maintainer to merge it by hand.
 */
function decideRelease(pr: StewardPr, current: CurrentMilestone | null): Decision {
  const version = RELEASE_TITLE.exec(pr.title)?.[1];
  if (!version) return { kind: 'wait', cause: 'release', why: 'release PR: no version in its title' };
  return (
    wrongVersion('release PR', version, current, 'release') ??
    whenGreen(pr, 'release PR', 'waiting for release-please to refresh it')
  );
}

/**
 * The milestone report PR (scripts/milestone-report.ts) is generated too (#187): it merges once its
 * version is the current milestone's, the milestone is done and its body ends with the `Release-As`
 * footer. Merging it switches release-please's PR to the milestone's version.
 */
function decideReport(pr: StewardPr, current: CurrentMilestone | null, version: string): Decision {
  const name = `report PR ${version}`;
  const wrong = wrongVersion('report PR', version, current, 'milestone');
  if (wrong) return wrong;
  if (!current) return { kind: 'wait', cause: 'milestone', why: `${name}: no open milestone` };
  if (!current.done)
    return { kind: 'wait', cause: 'milestone', why: `${name}: ${current.title} still has open issues` };
  if (lastParagraph(pr.body) !== `Release-As: ${version}`)
    return {
      kind: 'wait',
      cause: 'release',
      why: `${name}: its body doesn't end with Release-As: ${version}`,
    };
  return whenGreen(pr, 'report PR', 'not mergeable');
}

/** AUTO_STEWARD fires rounds and updates branches; AUTO_MERGE merges. */
export interface StewardSettings {
  readonly steward?: Routine;
  readonly merge: boolean;
}

const REASON_TEXT: Readonly<Record<Reason, string>> = {
  conflict: 'merge conflict',
  ci: 'failing checks',
  review: 'CI review findings',
  comment: 'maintainer comment',
  threads: 'unresolved review threads',
};
const describeReasons = (reasons: readonly Reason[]) => reasons.map((r) => REASON_TEXT[r]).join(', ');

/** The fire `text`: what the steward prompt (docs/agents/prompts/pr-steward.md) reads. */
export const stewardText = (pr: StewardPr, reasons: readonly Reason[], round: number) =>
  `PR: #${pr.number}\nBranch base: ${pr.base}\nReasons: ${reasons.join(', ')}\nRound: ${round} of ${MAX_ROUNDS}\nRepository: itay28/Military-TD`;

/** The hand-off comment for a PR the steward can't finish. */
const stuckBody = (summary: string) =>
  `**PR steward: handing this PR to you.** ${summary}\n\nComment on the PR to give it ${MAX_ROUNDS} more steward rounds, or fix it yourself.\n\n${STUCK_MARKER}`;

async function handOff(
  pr: StewardPr,
  body: string,
  token: string,
  fetchFn: Fetch,
  label: (typeof HAND_OFF_LABELS)[number] = NEEDS_YOU_LABEL,
): Promise<void> {
  // Summary first: the hand-off push (scripts/notify.ts) reads it when the label lands.
  await github(fetchFn, token, 'POST', `issues/${pr.number}/comments`, { body });
  await github(fetchFn, token, 'POST', `issues/${pr.number}/labels`, { labels: [label] });
}

/** Whether a decision's switch is on: AUTO_MERGE for merging and asking to merge, AUTO_STEWARD for the rest. */
export const switchedOn = (kind: Decision['kind'], settings: StewardSettings): boolean =>
  kind === 'merge' || kind === 'approval'
    ? settings.merge
    : kind === 'skip' || kind === 'wait' || settings.steward !== undefined;

/** Carry out a decision. With its switch off, an action is only logged. */
export async function act(
  pr: StewardPr,
  decision: Decision,
  token: string,
  settings: StewardSettings,
  fetchFn: Fetch = fetch,
): Promise<void> {
  const n = pr.number;
  if (!switchedOn(decision.kind, settings)) return;
  switch (decision.kind) {
    case 'steward': {
      let session: string | undefined;
      try {
        session = await fireRoutine(settings.steward!, stewardText(pr, decision.reasons, decision.round), fetchFn);
      } catch (error) {
        // Out of tokens or rate-limited: nothing is posted or counted, and a later run fires it (#200).
        if (classifyFireError(error) === 'temporary') {
          console.log(`#${n}: the fire was refused for now (usage or rate limit); retrying next run`);
          return;
        }
        await handOff(
          pr,
          stuckBody(
            `The steward's API trigger refused the fire (HTTP ${(error as { status?: number }).status}): check the ROUTINE_STEWARD_URL and ROUTINE_STEWARD_TOKEN secrets and the pr-steward routine at claude.ai/code/routines.`,
          ),
          token,
          fetchFn,
        );
        throw new Error(`#${n}: firing the PR steward failed, handed off: ${String(error)}`, { cause: error });
      }
      for (const label of decision.clearHandOff) await github(fetchFn, token, 'DELETE', `issues/${n}/labels/${label}`);
      const retry = decision.retry
        ? ' (a retry: the last round ended without reporting, most likely out of tokens)'
        : '';
      await github(fetchFn, token, 'POST', `issues/${n}/comments`, {
        body: `PR steward round ${decision.round}/${MAX_ROUNDS} started${retry} for: ${describeReasons(decision.reasons)}.${session ? ` Session: ${session}` : ''}\n\n${ROUND_MARKER}\n${roundMeta(decision.reasons, pr.baseSha)}`,
      });
      return;
    }
    case 'stuck':
      await handOff(
        pr,
        stuckBody(
          decision.conflict
            ? "The steward couldn't resolve the merge conflict: it's still there on the same base."
            : decision.unknown
              ? 'GitHub still reports mergeability as unknown, even after merging the base in.'
              : `${MAX_ROUNDS} steward rounds didn't finish it. Still open: ${describeReasons(decision.reasons)}.`,
        ),
        token,
        fetchFn,
      );
      return;
    case 'approval': {
      const paths = decision.paths.map((p) => `\`${p}\``).join(', ');
      await handOff(
        pr,
        `**PR steward: this PR needs your approval.** It's green and answered, but it changes files that are your call (#206): ${paths}.

Comment \`/approve\` to merge it, or comment what to change for a steward round.

${STUCK_MARKER}
${APPROVAL_MARKER}`,
        token,
        fetchFn,
        NEEDS_APPROVAL_LABEL,
      );
      return;
    }
    case 'review':
      await github(fetchFn, token, 'POST', `issues/${n}/comments`, {
        body: `PR steward: no CI review ran on this PR, so I added \`${REVIEW_AGAIN_LABEL}\` to start one. GitHub runs no PR workflow while a PR has a merge conflict, so marking it ready then doesn't start the review.\n\n${reviewRequestMarker(pr.headSha)}`,
      });
      await github(fetchFn, token, 'POST', `issues/${n}/labels`, { labels: [REVIEW_AGAIN_LABEL] });
      return;
    case 'ready':
      await graphql(
        token,
        'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }',
        {
          id: pr.id,
        },
      );
      await github(fetchFn, token, 'POST', `issues/${n}/comments`, {
        body: `PR steward: the round ended green, so I marked this draft ready for review. That starts the CI review.`,
      });
      return;
    case 'update':
      if (decision.unknown)
        await github(fetchFn, token, 'POST', `issues/${n}/comments`, {
          body: `PR steward: GitHub has reported mergeability as unknown for over an hour, so I'm merging the base in to make it compute again.\n\n${UNKNOWN_UPDATE_MARKER}`,
        });
      await github(fetchFn, token, 'PUT', `pulls/${n}/update-branch`, { expected_head_sha: pr.headSha });
      return;
    case 'merge':
      try {
        await github(fetchFn, token, 'PUT', `pulls/${n}/merge`, {
          merge_method: 'squash',
          commit_title: `${pr.title} (#${n})`,
          commit_message: pr.body,
          sha: pr.headSha,
        });
      } catch (error) {
        // The head moved since this run read it (e.g. a steward push): the next run decides again.
        if ((error as { status?: number }).status === 409) return;
        await handOff(
          pr,
          stuckBody(`It's green and answered, but GitHub refused the merge: ${String(error)}`),
          token,
          fetchFn,
        );
      }
      return;
    case 'skip':
    case 'wait':
      return;
  }
}

/**
 * The status labels (#419): every open PR that isn't a draft, a fork or on `hold` carries exactly
 * one, so the PR list shows why each PR waits. Red needs the maintainer, orange is main's CI,
 * yellow is an agent or a check at work, grey is queued behind something else, green is mergeable.
 * They mirror the hand-off labels (`needs-you`, `needs-approval`) and never replace them.
 */
export const STATUS_LABELS = {
  'waiting: you': {
    color: 'b60205',
    description: 'PR steward: waiting on the maintainer (an answer, an approval or a hand-off)',
  },
  'waiting: main CI': { color: 'd93f0b', description: "PR steward: ready, but main's CI is failing" },
  'waiting: agent': { color: 'fbca04', description: 'PR steward: an agent, a check or the CI review is at work' },
  'waiting: milestone': { color: 'cfd3d7', description: 'PR steward: its issue is in a later milestone' },
  'waiting: parent PR': { color: 'cfd3d7', description: 'PR steward: stacked, merges after its parent PR' },
  'waiting: blocker': { color: 'cfd3d7', description: 'PR steward: its issue is still blocked by open issues' },
  'ready to merge': { color: '0e8a16', description: 'PR steward: green and answered, merges next' },
} as const satisfies Record<string, { color: string; description: string }>;
export type StatusLabel = keyof typeof STATUS_LABELS;
const STATUS_LABEL_NAMES = Object.keys(STATUS_LABELS) as StatusLabel[];

const WAIT_LABEL: Readonly<Record<WaitCause, StatusLabel>> = {
  'needs-info': 'waiting: you',
  release: 'waiting: you',
  'main-ci': 'waiting: main CI',
  mergeability: 'waiting: agent',
  round: 'waiting: agent',
  checks: 'waiting: agent',
  review: 'waiting: agent',
  milestone: 'waiting: milestone',
  stacked: 'waiting: parent PR',
  blocked: 'waiting: blocker',
};

/** The status label a PR gets for this decision: none for a draft, a fork or a `hold` PR. */
export function statusLabel(decision: Decision, pr: StewardPr): StatusLabel | null {
  if (pr.isDraft || pr.fork || pr.labels.includes(HOLD_LABEL)) return null;
  switch (decision.kind) {
    // The only skip left once drafts, forks and `hold` are out: a hand-off the maintainer hasn't answered.
    case 'skip':
    case 'stuck':
    case 'approval':
      return 'waiting: you';
    case 'wait':
      return WAIT_LABEL[decision.cause];
    case 'steward':
    case 'update':
    case 'review':
    case 'ready':
      return 'waiting: agent';
    case 'merge':
      return 'ready to merge';
  }
}

/** The label writes that take a PR from `labels` to the status `label`: nothing when it's already right. */
export function labelChanges(
  labels: readonly string[],
  label: StatusLabel | null,
): { add: StatusLabel | null; remove: StatusLabel[] } {
  return {
    add: label && !labels.includes(label) ? label : null,
    remove: STATUS_LABEL_NAMES.filter((l) => l !== label && labels.includes(l)),
  };
}

/** Rethrows `error` unless it is a GitHub API error with this HTTP status. */
function ignoreStatus(error: unknown, status: number): void {
  if ((error as { status?: number }).status !== status) throw error;
}

/**
 * Gives a PR its status label and removes the stale one. No request when it's already right, so a
 * run with no changes makes no label calls (#293). Two separate writes rather than one `PUT` of the
 * whole set, which would undo a label someone changed since the PR was read. Returns whether it wrote.
 */
export async function applyStatusLabel(
  pr: StewardPr,
  label: StatusLabel | null,
  token: string,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  const { add, remove } = labelChanges(pr.labels, label);
  if (add) await github(fetchFn, token, 'POST', `issues/${pr.number}/labels`, { labels: [add] });
  for (const stale of remove) {
    try {
      await github(fetchFn, token, 'DELETE', `issues/${pr.number}/labels/${encodeURIComponent(stale)}`);
    } catch (error) {
      // Someone removed it since the PR was read.
      ignoreStatus(error, 404);
    }
  }
  return add !== null || remove.length > 0;
}

/** Creates the status labels the repo lacks (`existing` comes from PR_QUERY), so they get their colours. */
export async function ensureStatusLabels(
  existing: readonly string[],
  token: string,
  fetchFn: Fetch = fetch,
): Promise<void> {
  for (const name of STATUS_LABEL_NAMES.filter((l) => !existing.includes(l))) {
    try {
      await github(fetchFn, token, 'POST', 'labels', { name, ...STATUS_LABELS[name] });
    } catch (error) {
      // 422: it exists (a list cut short at 100 labels, or another run made it).
      ignoreStatus(error, 422);
    }
  }
}

/**
 * The steward's settings from the environment. A missing steward secret with AUTO_STEWARD on is an
 * error, so a misconfigured steward fails loudly.
 */
export function settingsFromEnv(env: Readonly<Record<string, string | undefined>>): StewardSettings {
  const merge = env['AUTO_MERGE']?.trim() === 'on';
  if (env['AUTO_STEWARD']?.trim() !== 'on') return { merge };
  const read = (name: string) => {
    const value = env[name]?.trim();
    if (!value)
      throw new Error(
        `AUTO_STEWARD is on but the repo secret ${name} is not set (docs/agents/issue-tracker.md → PR steward).`,
      );
    return value;
  };
  return { steward: { url: read('ROUTINE_STEWARD_URL'), token: read('ROUTINE_STEWARD_TOKEN') }, merge };
}

// Read every open PR in one call. A milestone's open issues only show whether it is done (only its
// release issue left), so a few are enough: more than that is never done. Reading 100 per
// milestone was most of this query's cost, run on every CI result and comment (#293).
export const PR_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    labels(first: 100) { nodes { name } }
    defaultBranchRef { name target { ... on Commit { statusCheckRollup { contexts(first: 100) { nodes { ...Context } } } } } }
    issues(states: OPEN, labels: ["bug"], first: 50) { nodes { number body } }
    milestones(states: OPEN, first: 50) {
      nodes { number title dueOn issues(states: OPEN, first: 5) { pageInfo { hasNextPage } nodes { labels(first: 20) { nodes { name } } } } }
    }
    pullRequests(states: OPEN, first: 50) {
      totalCount
      nodes {
        id number title body isDraft isCrossRepository baseRefName baseRefOid headRefName headRefOid mergeable mergeStateStatus
        baseRef { target { oid } }
        labels(first: 20) { nodes { name } }
        reviewThreads(first: 100) { nodes { isResolved } }
        closingIssuesReferences(first: 10) {
          nodes { number labels(first: 20) { nodes { name } } issueDependenciesSummary { blockedBy } milestone { number title } }
        }
        comments(last: 100) { nodes { author { login __typename } authorAssociation body createdAt } }
        files(first: 100) { totalCount nodes { path changeType } }
        recentCommits: commits(last: 20) { nodes { commit { committedDate parents { totalCount } } } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 100) { nodes { ...Context } }
              }
            }
          }
        }
      }
    }
  }
}

fragment Context on StatusCheckRollupContext {
  __typename
  ... on CheckRun { name status conclusion completedAt }
  ... on StatusContext { context state }
}`;

interface ContextNode {
  __typename: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  completedAt?: string | null;
  context?: string;
  state?: string;
}

interface PrNode {
  id: string;
  number: number;
  title: string;
  body: string;
  isDraft: boolean;
  isCrossRepository: boolean;
  baseRefName: string;
  baseRefOid: string;
  /** The base branch now; null once it's deleted. */
  baseRef: { target: { oid: string } | null } | null;
  headRefName: string;
  headRefOid: string;
  mergeable: StewardPr['mergeable'];
  mergeStateStatus: string;
  labels: { nodes: { name: string }[] };
  reviewThreads: { nodes: { isResolved: boolean }[] };
  closingIssuesReferences: {
    nodes: {
      number: number;
      labels: { nodes: { name: string }[] };
      issueDependenciesSummary: { blockedBy: number } | null;
      milestone: MilestoneRef | null;
    }[];
  };
  comments: {
    nodes: {
      author: { login: string; __typename: string } | null;
      authorAssociation: string;
      body: string;
      createdAt: string;
    }[];
  };
  files: ChangedFiles | null;
  recentCommits: { nodes: RecentCommit[] };
  commits: { nodes: { commit: { statusCheckRollup: { contexts: { nodes: ContextNode[] } } | null } }[] };
}

interface ChangedFiles {
  totalCount: number;
  nodes: { path: string; changeType: string }[];
}

interface RecentCommit {
  commit: { committedDate: string; parents: { totalCount: number } };
}

/** A PR's changed paths, or null when GitHub has more than were read or the field didn't come back. */
export const changedFiles = (files: ChangedFiles | null): string[] | null =>
  files && files.totalCount <= files.nodes.length ? files.nodes.map((f) => f.path) : null;

/** A renamed file. GraphQL gives only its new path; `from` comes from the REST file list (#417). */
export interface Rename {
  readonly path: string;
  readonly from: string | null;
}

/** The files a PR renames, by their new path; their old paths aren't known yet. */
export const renamedFiles = (files: ChangedFiles | null): Rename[] =>
  (files?.nodes ?? []).filter((f) => f.changeType === 'RENAMED').map((f) => ({ path: f.path, from: null }));

/** One entry of REST `GET pulls/{n}/files`. */
export interface RestFile {
  readonly filename: string;
  readonly status: string;
  readonly previous_filename?: string;
}

/** Fills in each rename's old path from the REST file list; one it doesn't list stays unknown. */
export const renameSources = (renamed: readonly Rename[], rest: readonly RestFile[]): Rename[] =>
  renamed.map((r) => ({
    path: r.path,
    from: rest.find((f) => f.filename === r.path && f.status === 'renamed')?.previous_filename ?? r.from,
  }));

/** The renames that need an approval: away from a critical path, or from a path that isn't known. */
const renamedCritical = (renamed: readonly Rename[]): string[] =>
  renamed.flatMap((r) =>
    r.from === null
      ? [`${r.path} (renamed: its old path is unknown)`]
      : criticalFiles([r.from]).length
        ? [`${r.path} (renamed from ${r.from})`]
        : [],
  );

/** Reads the old paths of a PR's renames (one request, only for a PR that renames something). */
async function withRenameSources(pr: StewardPr, token: string): Promise<StewardPr> {
  if (!pr.renamed.length) return pr;
  try {
    const res = await github(fetch, token, 'GET', `pulls/${pr.number}/files?per_page=100`);
    return { ...pr, renamed: renameSources(pr.renamed, (await res.json()) as RestFile[]) };
  } catch (error) {
    console.log(`#${pr.number}: couldn't read the renamed files' old paths, so they stay gated: ${String(error)}`);
    return pr;
  }
}

/**
 * When the latest commit (oldest first) that isn't a merge was made, or the latest commit's time if
 * all are merges. Merging the base brings in reviewed code, so it keeps an approval; new code doesn't.
 */
export const codeCommittedAt = (commits: readonly RecentCommit[]): string | null =>
  (commits.findLast((c) => c.commit.parents.totalCount === 1) ?? commits.at(-1))?.commit.committedDate ?? null;

interface PrData {
  repository: {
    labels: { nodes: { name: string }[] };
    defaultBranchRef: {
      name: string;
      target: { statusCheckRollup: { contexts: { nodes: ContextNode[] } } | null } | null;
    };
    issues: { nodes: { number: number; body: string }[] };
    milestones: {
      nodes: {
        number: number;
        title: string;
        dueOn: string | null;
        issues: { pageInfo: { hasNextPage: boolean }; nodes: { labels: { nodes: { name: string }[] } }[] };
      }[];
    };
    pullRequests: { totalCount: number; nodes: PrNode[] };
  };
}

function toCheck(node: ContextNode): Check {
  if (node.__typename === 'CheckRun') {
    if (node.status !== 'COMPLETED') return { name: node.name ?? '', state: 'pending' };
    const passed = ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(node.conclusion ?? '');
    const state = node.conclusion === 'CANCELLED' ? 'cancelled' : passed ? 'success' : 'failure';
    return { name: node.name ?? '', state, ...(node.completedAt ? { completedAt: node.completedAt } : {}) };
  }
  const state =
    node.state === 'SUCCESS'
      ? 'success'
      : node.state === 'PENDING' || node.state === 'EXPECTED'
        ? 'pending'
        : 'failure';
  return { name: node.context ?? '', state };
}

export function toStewardPr(node: PrNode): StewardPr {
  return {
    id: node.id,
    number: node.number,
    title: node.title,
    body: node.body,
    isDraft: node.isDraft,
    fork: node.isCrossRepository,
    base: node.baseRefName,
    // baseRefOid only moves when the head is pushed, so a later merge into the base would look
    // like a conflict a round already failed to resolve (#296). Use the base branch's tip.
    baseSha: node.baseRef?.target?.oid ?? node.baseRefOid,
    head: node.headRefName,
    headSha: node.headRefOid,
    labels: node.labels.nodes.map((l) => l.name),
    mergeable: node.mergeable,
    behind: node.mergeStateStatus === 'BEHIND',
    checks: (node.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []).map(toCheck),
    unresolvedThreads: node.reviewThreads.nodes.filter((t) => !t.isResolved).length,
    closes: node.closingIssuesReferences.nodes.map((i) => ({
      number: i.number,
      blocked: (i.issueDependenciesSummary?.blockedBy ?? 0) > 0,
      needsInfo: i.labels.nodes.some((l) => l.name === 'needs-info'),
      milestone: i.milestone,
    })),
    files: changedFiles(node.files),
    renamed: renamedFiles(node.files),
    codeCommittedAt: codeCommittedAt(node.recentCommits.nodes),
    lastCommitAt: node.recentCommits.nodes.at(-1)?.commit.committedDate ?? null,
    comments: node.comments.nodes.map((c) => ({
      author: c.author?.login ?? '',
      bot: c.author?.__typename === 'Bot',
      association: c.authorAssociation,
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
}

/** From a milestone's open issues: only its release issue is left. A truncated list (more pages) is never done. */
export const milestoneDone = (open: readonly { labels: { nodes: { name: string }[] } }[], truncated = false): boolean =>
  !truncated && isMilestoneDone(open.map((i) => ({ state: 'open', labels: i.labels.nodes.map((l) => l.name) })));

async function reconcileOpenPrs(token: string, settings: StewardSettings, dryRun: boolean): Promise<void> {
  const { repository } = await graphql<PrData>(token, PR_QUERY, { owner: 'itay28', name: 'Military-TD' });
  const { nodes, totalCount } = repository.pullRequests;
  if (totalCount > nodes.length)
    console.log(`::warning::${totalCount} open PRs, only the first ${nodes.length} were read. Paginate PR_QUERY.`);
  const now = new Date();
  const failures: string[] = [];
  const currentNumber = currentMilestone(repository.milestones.nodes);
  const current = repository.milestones.nodes.find((m) => m.number === currentNumber) ?? null;
  const mainChecks = (repository.defaultBranchRef.target?.statusCheckRollup?.contexts.nodes ?? []).map(toCheck);
  const mainRed = mainRedFrom(currentChecks(mainChecks), repository.issues.nodes);
  if (mainRed) console.log(`${repository.defaultBranchRef.name} CI is failing: only its fix merges (#220).`);
  // Labelling is reporting, not acting: it runs with AUTO_STEWARD and AUTO_MERGE off too (#419).
  // A failure here is recorded, never allowed to stop the PRs from being acted on.
  if (!dryRun) {
    try {
      await ensureStatusLabels(
        repository.labels.nodes.map((l) => l.name),
        token,
      );
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  let relabelled = 0;
  for (const pr of await Promise.all(nodes.map((node) => withRenameSources(toStewardPr(node), token)))) {
    const decision = decide(
      pr,
      now,
      repository.defaultBranchRef.name,
      current && {
        number: current.number,
        title: current.title,
        after: milestoneOrder(repository.milestones.nodes).filter((n) => n !== current.number),
        done: milestoneDone(current.issues.nodes, current.issues.pageInfo.hasNextPage),
      },
      mainRed,
    );
    const switchedOff = !switchedOn(decision.kind, settings);
    const detail =
      decision.kind === 'skip' || decision.kind === 'wait'
        ? decision.why
        : decision.kind === 'steward'
          ? `round ${decision.round}: ${describeReasons(decision.reasons)}`
          : decision.kind === 'stuck'
            ? describeReasons(decision.reasons)
            : decision.kind === 'approval'
              ? decision.paths.join(', ')
              : '';
    const note = dryRun ? ' (dry run)' : switchedOff ? ' (switched off)' : '';
    const label = statusLabel(decision, pr);
    const { add, remove } = labelChanges(pr.labels, label);
    const relabel =
      add || remove.length ? `; label ${add ?? 'none'}${remove.length ? `, was ${remove.join(', ')}` : ''}` : '';
    console.log(`#${pr.number}: ${decision.kind}${detail ? ` (${detail})` : ''}${note}${relabel}`);
    if (dryRun) continue;
    // A merge about to happen closes the PR, so its label would be a wasted write.
    if (!(decision.kind === 'merge' && settings.merge)) {
      try {
        if (await applyStatusLabel(pr, label, token)) relabelled++;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
    try {
      await act(pr, decision, token, settings);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  console.log(`Status labels: ${relabelled} PR${relabelled === 1 ? '' : 's'} relabelled.`);
  if (failures.length) throw new Error(failures.join('\n'));
}

// CLI: `node scripts/pr-steward.ts [--dry-run]`, with PROJECT_TOKEN (classic PAT, project + repo
// scopes), AUTO_STEWARD / AUTO_MERGE and the ROUTINE_STEWARD_* secrets. Errors fail the run, except
// an exhausted API quota (#293): that logs the reset time and passes, and the next run catches up.
// Every run ends with the requests it made and the quota left.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env['PROJECT_TOKEN']?.trim();
  const meter = new ApiMeter();
  globalThis.fetch = meter.wrap(globalThis.fetch) as typeof fetch;
  try {
    if (!token) throw new Error('PROJECT_TOKEN is not set, so no PR was checked.');
    await reconcileOpenPrs(token, settingsFromEnv(process.env), process.argv.includes('--dry-run'));
  } catch (error) {
    if (!softFail(meter)) {
      console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
  console.log(meter.summary());
}

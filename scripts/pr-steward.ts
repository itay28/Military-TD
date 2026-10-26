import { pathToFileURL } from 'node:url';
import { classifyFireError, fireRoutine, github, type Fetch, type Routine } from './auto-start.ts';
import { currentMilestone, graphql, milestoneOrder } from './board-sync.ts';
import { isMilestoneDone, releaseVersion } from './milestone-report.ts';

// The PR steward (docs/agents/issue-tracker.md → PR steward, ADR-0008): run by
// .github/workflows/pr-steward.yml after CI and the CI review, on PR comments and reviews, on a
// push to main and on a schedule. Each run reconciles every open PR: fire a steward round (a
// cloud task that fixes conflicts, CI, review findings and comments), merge the base into a PR
// that is only behind, hand a stuck PR to the maintainer, or squash-merge a finished one.
// `decide` is pure; `act` and the CLI at the bottom do the writing.

/** Starts the CI review's comment (.github/workflows/claude-code-review.yml). */
export const REVIEW_HEADING = '## Code review (mattpocock-skills:code-review)';
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
 * marker. A round that didn't died, most likely out of tokens; it's retried and never counted (#200).
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
 * Rounds that count toward MAX_ROUNDS among `rounds` (round markers): only finished ones. A
 * round fired only for a conflict is free too: conflicts come from the base moving, and one the
 * agent can't resolve hands off at once (see `unresolvedConflict`). A marker without a meta line counts.
 */
function countedRounds(rounds: readonly PrComment[], finished: (round: PrComment) => boolean): number {
  return rounds.filter((r) => {
    const meta = parseRoundMeta(r.body);
    return finished(r) && !(meta && meta.reasons.length === 1 && meta.reasons[0] === 'conflict');
  }).length;
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
/** Rounds a PR gets before it's handed off; a maintainer comment gives it fresh ones (#165). */
export const MAX_ROUNDS = 3;
/** A round with no done marker after this long has died (e.g. its session hit a usage limit) and is retried, not counted (#200). Real rounds take minutes (#196). */
const ROUND_TIMEOUT_MS = 60 * 60 * 1000;
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
  /** Renamed files, by their new path: the old one isn't known, so they're gated (#206). */
  readonly renamed: readonly string[];
  /** When the latest commit that isn't a merge was made: an approval must come after it. */
  readonly codeCommittedAt: string | null;
  /** Conversation comments, oldest first. */
  readonly comments: readonly PrComment[];
}

/** Why a round is needed, in the order they're listed. */
export type Reason = 'conflict' | 'ci' | 'review' | 'comment' | 'threads';

export type Decision =
  | { readonly kind: 'skip'; readonly why: string }
  | { readonly kind: 'wait'; readonly why: string }
  | { readonly kind: 'update' }
  /** No CI review ever ran on this PR: add `review-again` to start one (#209). */
  | { readonly kind: 'review' }
  | {
      readonly kind: 'steward';
      readonly reasons: readonly Reason[];
      readonly round: number;
      /** The latest round died without its done marker; this one fires it again (#200). */
      readonly retry: boolean;
      /** A maintainer comment restarted a handed-off PR. */
      readonly clearNeedsYou: boolean;
    }
  | {
      readonly kind: 'stuck';
      readonly reasons: readonly Reason[];
      /** A conflict round didn't resolve the conflict. */
      readonly conflict?: boolean;
    }
  | { readonly kind: 'merge' }
  /** Ready to merge, but it touches a critical path (#206): hand off for the maintainer's `/approve`. */
  | { readonly kind: 'approval'; readonly paths: readonly string[] };

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
 * maintainer `/approve` came after the latest round (#206).
 */
export function decide(
  pr: StewardPr,
  now: Date,
  defaultBranch = 'main',
  current: CurrentMilestone | null = null,
): Decision {
  if (pr.isDraft) return { kind: 'skip', why: 'draft' };
  if (pr.fork) return { kind: 'skip', why: 'fork' };
  if (pr.labels.includes(HOLD_LABEL)) return { kind: 'skip', why: HOLD_LABEL };
  if (pr.head.startsWith(RELEASE_BRANCH)) return decideRelease(pr, current);
  const report = REPORT_BRANCH.exec(pr.head)?.[1];
  if (report) return decideReport(pr, current, report);
  const checks = currentChecks(pr.checks);

  // The time of the latest comment matching `test`, or 0.
  const last = (test: (c: PrComment) => boolean) =>
    Math.max(0, ...pr.comments.filter(test).map((c) => Date.parse(c.createdAt)));
  const lastMaintainer = last(isMaintainer);
  const lastDone = last((c) => c.body.includes(DONE_MARKER));
  const lastRound = last((c) => c.body.includes(ROUND_MARKER));
  const lastReview = last((c) => c.body.startsWith(REVIEW_HEADING));

  const clearNeedsYou = pr.labels.includes(NEEDS_YOU_LABEL);
  if (clearNeedsYou) {
    const lastStuck = last((c) => c.body.includes(STUCK_MARKER));
    if (!lastStuck || lastMaintainer <= lastStuck)
      return { kind: 'skip', why: 'handed off, waiting on the maintainer' };
  }
  if (pr.mergeable === 'UNKNOWN') return { kind: 'wait', why: 'GitHub is computing mergeability' };
  if (lastRound > lastDone && now.getTime() - lastRound < ROUND_TIMEOUT_MS)
    return { kind: 'wait', why: 'a steward round is in flight' };

  const relevant = checks.filter((c) => !IGNORED_CHECKS.includes(c.name));
  const conflict = pr.mergeable === 'CONFLICTING';
  const pending =
    relevant.some((c) => c.state === 'pending') ||
    checks.some((c) => c.name === 'claude-review' && c.state === 'pending');
  // Running checks may still fail or post a review: wait so one round handles it all, unless
  // there's a conflict, which no check result changes.
  if (pending && !conflict) return { kind: 'wait', why: 'checks are running' };

  const reasons: Reason[] = [];
  if (conflict) reasons.push('conflict');
  if (relevant.some((c) => c.state === 'failure')) reasons.push('ci');
  if (lastReview > lastDone) reasons.push('review');
  if (last((c) => isMaintainer(c) && !isApproval(c)) > lastDone) reasons.push('comment');
  if (pr.unresolvedThreads > 0) reasons.push('threads');
  if (reasons.length) {
    const since = pr.comments.filter((c) => c.body.includes(ROUND_MARKER) && Date.parse(c.createdAt) > lastMaintainer);
    const finished = finishedRound(pr.comments);
    if (conflict && unresolvedConflict(since, pr.baseSha, finished))
      return { kind: 'stuck', reasons: ['conflict'], conflict: true };
    const used = countedRounds(since, finished);
    const latest = since.at(-1);
    return used >= MAX_ROUNDS
      ? { kind: 'stuck', reasons }
      : { kind: 'steward', reasons, round: used + 1, retry: !!latest && !finished(latest), clearNeedsYou };
  }
  if (pr.behind) return { kind: 'update' };
  if (!lastReview)
    return pr.comments.some((c) => c.body.includes(reviewRequestMarker(pr.headSha)))
      ? { kind: 'wait', why: 'no CI review yet (requested for this commit; add `review-again` to ask again)' }
      : { kind: 'review' };
  if (pr.base !== defaultBranch) return { kind: 'wait', why: `stacked on ${pr.base}: merges after its parent` };
  const held = pr.closes.find((i) => i.blocked || i.needsInfo);
  if (held)
    return {
      kind: 'wait',
      why: held.blocked
        ? `#${held.number} is still blocked by open issues`
        : `#${held.number} has an open question (needs-info)`,
    };
  // Look-ahead work (auto-start's next milestone) merges only once the current milestone has shipped.
  const ahead = current && pr.closes.find((i) => i.milestone && current.after.includes(i.milestone.number));
  if (ahead && current)
    return {
      kind: 'wait',
      why: `#${ahead.number} is in ${ahead.milestone!.title}: merges after ${current.title} ships`,
    };
  const paths = [
    ...(pr.files ? criticalFiles(pr.files) : ['(more files than were read)']),
    ...pr.renamed.map((p) => `${p} (renamed: its old path may be critical)`),
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
function wrongVersion(name: string, version: string, current: CurrentMilestone | null): Decision | null {
  if (current && version === releaseVersion(current.title)) return null;
  return {
    kind: 'wait',
    why: `${name} ${version}: ${current ? `ships with ${current.title}` : 'no open milestone'}; merge it by hand to release now`,
  };
}

/** A generated PR merges once its checks are green (some must have run), and is brought up to date when behind. */
function whenGreen(pr: StewardPr, name: string, unmergeable: string): Decision {
  const relevant = currentChecks(pr.checks).filter((c) => !IGNORED_CHECKS.includes(c.name));
  if (pr.mergeable !== 'MERGEABLE') return { kind: 'wait', why: `${name}: ${unmergeable}` };
  if (!relevant.length) return { kind: 'wait', why: `${name}: no checks ran on it` };
  if (relevant.some((c) => c.state !== 'success')) return { kind: 'wait', why: `${name}: checks running or failing` };
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
  if (!version) return { kind: 'wait', why: 'release PR: no version in its title' };
  return (
    wrongVersion('release PR', version, current) ??
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
  const wrong = wrongVersion('report PR', version, current);
  if (wrong) return wrong;
  if (!current) return { kind: 'wait', why: `${name}: no open milestone` };
  if (!current.done) return { kind: 'wait', why: `${name}: ${current.title} still has open issues` };
  if (lastParagraph(pr.body) !== `Release-As: ${version}`)
    return { kind: 'wait', why: `${name}: its body doesn't end with Release-As: ${version}` };
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

async function handOff(pr: StewardPr, body: string, token: string, fetchFn: Fetch): Promise<void> {
  // Summary first: the needs-you push (scripts/notify.ts) reads it when the label lands.
  await github(fetchFn, token, 'POST', `issues/${pr.number}/comments`, { body });
  await github(fetchFn, token, 'POST', `issues/${pr.number}/labels`, { labels: [NEEDS_YOU_LABEL] });
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
      if (decision.clearNeedsYou) await github(fetchFn, token, 'DELETE', `issues/${n}/labels/${NEEDS_YOU_LABEL}`);
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
      );
      return;
    }
    case 'review':
      await github(fetchFn, token, 'POST', `issues/${n}/comments`, {
        body: `PR steward: no CI review ran on this PR, so I added \`${REVIEW_AGAIN_LABEL}\` to start one. GitHub runs no PR workflow while a PR has a merge conflict, so marking it ready then doesn't start the review.\n\n${reviewRequestMarker(pr.headSha)}`,
      });
      await github(fetchFn, token, 'POST', `issues/${n}/labels`, { labels: [REVIEW_AGAIN_LABEL] });
      return;
    case 'update':
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

const PR_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    milestones(states: OPEN, first: 50) {
      nodes { number title dueOn issues(states: OPEN, first: 100) { pageInfo { hasNextPage } nodes { labels(first: 20) { nodes { name } } } } }
    }
    pullRequests(states: OPEN, first: 50) {
      totalCount
      nodes {
        number title body isDraft isCrossRepository baseRefName baseRefOid headRefName headRefOid mergeable mergeStateStatus
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
                contexts(first: 100) {
                  nodes {
                    __typename
                    ... on CheckRun { name status conclusion completedAt }
                    ... on StatusContext { context state }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
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
  number: number;
  title: string;
  body: string;
  isDraft: boolean;
  isCrossRepository: boolean;
  baseRefName: string;
  baseRefOid: string;
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

/** The new paths of the files a PR renames. */
export const renamedFiles = (files: ChangedFiles | null): string[] =>
  (files?.nodes ?? []).filter((f) => f.changeType === 'RENAMED').map((f) => f.path);

/**
 * When the latest commit (oldest first) that isn't a merge was made, or the latest commit's time if
 * all are merges. Merging the base brings in reviewed code, so it keeps an approval; new code doesn't.
 */
export const codeCommittedAt = (commits: readonly RecentCommit[]): string | null =>
  (commits.findLast((c) => c.commit.parents.totalCount === 1) ?? commits.at(-1))?.commit.committedDate ?? null;

interface PrData {
  repository: {
    defaultBranchRef: { name: string };
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
    number: node.number,
    title: node.title,
    body: node.body,
    isDraft: node.isDraft,
    fork: node.isCrossRepository,
    base: node.baseRefName,
    baseSha: node.baseRefOid,
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
  for (const pr of nodes.map(toStewardPr)) {
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
    console.log(`#${pr.number}: ${decision.kind}${detail ? ` (${detail})` : ''}${note}`);
    if (dryRun) continue;
    try {
      await act(pr, decision, token, settings);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
}

// CLI: `node scripts/pr-steward.ts [--dry-run]`, with PROJECT_TOKEN (classic PAT, project + repo
// scopes), AUTO_STEWARD / AUTO_MERGE and the ROUTINE_STEWARD_* secrets. Errors fail the run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env['PROJECT_TOKEN']?.trim();
  try {
    if (!token) throw new Error('PROJECT_TOKEN is not set, so no PR was checked.');
    await reconcileOpenPrs(token, settingsFromEnv(process.env), process.argv.includes('--dry-run'));
  } catch (error) {
    console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

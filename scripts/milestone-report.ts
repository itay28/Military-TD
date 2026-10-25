import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** An issue or PR, as the report links it. */
export interface Ref {
  number: number;
  title: string;
  url: string;
}

/** One issue in a milestone, as the report needs it. */
export interface MilestoneIssue extends Ref {
  state: 'open' | 'closed';
  stateReason: 'completed' | 'not_planned' | 'duplicate' | 'reopened' | null;
  labels: string[];
  /** Merged PRs that closed it. */
  closedBy: Ref[];
}

/** An issue removed from the milestone while it ran, and the milestone it is in now. */
export interface MovedIssue extends Ref {
  nowIn: string | null;
}

/** A milestone, as the report and PR body link it. */
export interface MilestoneLink {
  title: string;
  url: string;
}

/** A `repository.milestone.issues` node from the GraphQL query in `fetchMilestone`. */
export interface IssueNode {
  number: number;
  title: string;
  url: string;
  state: string;
  stateReason: string | null;
  labels: { nodes: { name: string }[] };
  closedByPullRequestsReferences: { nodes: (Ref & { merged: boolean })[] };
}

/** An entry from `GET /repos/{owner}/{repo}/issues/events`. */
export interface IssueEvent {
  event: string;
  milestone?: { title: string };
  issue?: {
    number: number;
    title: string;
    html_url: string;
    milestone: { title: string } | null;
    pull_request?: unknown;
  };
}

/** A PR from `gh pr list --state merged --json number,title,url,mergedAt,closingIssuesReferences`. */
export interface MergedPr extends Ref {
  mergedAt: string;
  closingIssuesReferences: { number: number }[];
}

const toRef = ({ number, title, url }: Ref): Ref => ({ number, title, url });

export function parseMilestoneIssues(nodes: IssueNode[]): MilestoneIssue[] {
  return [...nodes]
    .sort((a, b) => a.number - b.number)
    .map((node) => ({
      number: node.number,
      title: node.title,
      url: node.url,
      state: node.state === 'OPEN' ? 'open' : 'closed',
      stateReason: (node.stateReason?.toLowerCase() ?? null) as MilestoneIssue['stateReason'],
      labels: node.labels.nodes.map((label) => label.name),
      closedBy: node.closedByPullRequestsReferences.nodes.filter((pr) => pr.merged).map(toRef),
    }));
}

/** Issues taken out of the milestone while it ran (`demilestoned` events), unless they are back in it. */
export function movedOut(events: IssueEvent[], milestoneTitle: string, inMilestone: number[]): MovedIssue[] {
  const moved = new Map<number, MovedIssue>();
  for (const { event, milestone, issue } of events) {
    if (event !== 'demilestoned' || milestone?.title !== milestoneTitle || !issue || issue.pull_request) continue;
    if (inMilestone.includes(issue.number)) continue;
    moved.set(issue.number, {
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      nowIn: issue.milestone?.title ?? null,
    });
  }
  return [...moved.values()].sort((a, b) => a.number - b.number);
}

/**
 * Work that landed during the milestone without being planned in it: PRs merged after `since` (the
 * previous release; null for all of history) that close no milestone issue. release-please's own
 * release PRs are bookkeeping and left out.
 */
export function addedPrs(prs: MergedPr[], milestoneIssues: number[], since: string | null): Ref[] {
  const after = since === null ? -Infinity : Date.parse(since);
  return prs
    .filter((pr) => Date.parse(pr.mergedAt) > after)
    .filter((pr) => !pr.title.startsWith('chore(main): release '))
    .filter((pr) => !pr.closingIssuesReferences.some((ref) => milestoneIssues.includes(ref.number)))
    .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt))
    .map(toRef);
}

const RELEASE_LABEL = 'release';
const isRelease = (issue: MilestoneIssue): boolean => issue.labels.includes(RELEASE_LABEL);

/** The release a milestone ships as: `v0.1.0 — MVP` → `0.1.0`. Null when the title has no leading version. */
export function releaseVersion(title: string): string | null {
  return /^v(\d+\.\d+\.\d+)\b/.exec(title)?.[1] ?? null;
}

const parseVersion = (version: string): number[] => version.split('.').map(Number);
const compareVersions = (a: number[], b: number[]): number => a.reduce((d, n, i) => d || n - (b[i] ?? 0), 0);

/**
 * The tag of the previous milestone's release (the highest `vX.Y.0` below `version`): the milestone
 * started there. Patch releases in between don't count. Null when no milestone has been released yet.
 */
export function previousReleaseTag(tags: string[], version: string): string | null {
  const target = parseVersion(version);
  const releases = tags
    .filter((tag) => /^v\d+\.\d+\.0$/.test(tag))
    .map((tag) => ({ tag, version: parseVersion(tag.slice(1)) }))
    .filter((release) => compareVersions(release.version, target) < 0)
    .sort((a, b) => compareVersions(b.version, a.version));
  return releases[0]?.tag ?? null;
}

/** The milestone's open release issue, which stands in for it on the board. */
export function releaseIssue(issues: MilestoneIssue[]): MilestoneIssue | undefined {
  return issues.find((issue) => isRelease(issue) && issue.state === 'open');
}

/** Done means every issue is closed except the open release issue. Once released, that issue closes too, so it stops counting as done. */
export function isMilestoneDone(issues: MilestoneIssue[]): boolean {
  return releaseIssue(issues) !== undefined && issues.every((issue) => isRelease(issue) || issue.state === 'closed');
}

export interface ReportData {
  version: string;
  milestone: MilestoneLink;
  issues: MilestoneIssue[];
  movedOut: MovedIssue[];
  added: Ref[];
  /** The previous release tag Added counts from; null for all of history. */
  since: string | null;
}

const NOTES_HEADING = '## Notes';
const NOTES_PLACEHOLDER =
  "<!-- For the reviewer: highlights, known issues, anything the changelog doesn't say. Kept when this report is regenerated. -->";

const escapeMarkdown = (text: string): string => text.replace(/[[\]\\]/g, (c) => `\\${c}`);
const link = (ref: Ref): string => `[#${ref.number} ${escapeMarkdown(ref.title)}](${ref.url})`;
const milestoneLink = (milestone: MilestoneLink): string => `[${escapeMarkdown(milestone.title)}](${milestone.url})`;
const list = (lines: string[]): string => (lines.length ? lines.join('\n') : 'None.');
const isSkipped = (issue: MilestoneIssue): boolean =>
  issue.stateReason === 'not_planned' || issue.stateReason === 'duplicate';
const outcome = (issue: MilestoneIssue): string =>
  issue.state === 'open' ? 'open' : isSkipped(issue) ? 'skipped' : 'delivered';

/** `docs/releases/<version>.md`: the audit of what the milestone planned and delivered, ending with the human's Notes. */
export function buildReport(data: ReportData, notes?: string): string {
  const planned = data.issues.filter((issue) => !isRelease(issue));
  const closed = planned.filter((issue) => issue.state === 'closed');
  const delivered = closed.filter((issue) => !isSkipped(issue));
  const release = releaseIssue(data.issues);
  const since = data.since === null ? 'since the start of the project' : `since \`${data.since}\``;

  return (
    [
      `# Release ${data.version}`,
      `Audit of the milestone ${milestoneLink(data.milestone)}, written by the Milestone report workflow` +
        `${release ? `. Release issue: ${link(release)}` : ''}. **Added** counts PRs merged ${since}.`,
      '## Planned',
      list(planned.map((issue) => `- ${link(issue)}: ${outcome(issue)}`)),
      '## Delivered',
      list(
        delivered.map((issue) =>
          issue.closedBy.length
            ? `- ${link(issue)} by ${issue.closedBy.map(link).join(', ')}`
            : `- ${link(issue)}, no PR`,
        ),
      ),
      '## Skipped',
      list(closed.filter(isSkipped).map((issue) => `- ${link(issue)}`)),
      '## Moved out',
      list(data.movedOut.map((issue) => `- ${link(issue)}, now in ${issue.nowIn ?? 'no milestone'}`)),
      '## Added',
      list(data.added.map((pr) => `- ${link(pr)}`)),
      NOTES_HEADING,
      notes ?? NOTES_PLACEHOLDER,
    ].join('\n\n') + '\n'
  );
}

/** The Notes a human wrote in an earlier version of the report, or undefined if it still has the placeholder. */
export function extractNotes(report: string): string | undefined {
  const start = report.lastIndexOf(`\n${NOTES_HEADING}\n`);
  if (start < 0) return undefined;
  const notes = report.slice(start + NOTES_HEADING.length + 2).trim();
  return notes && notes !== NOTES_PLACEHOLDER ? notes : undefined;
}

export function reportPrTitle(version: string): string {
  return `chore: release ${version}`;
}

/**
 * The report PR's body. Squash merge copies it into the commit, and release-please reads `Release-As`
 * only from the commit's last paragraph, so that line closes the body on its own (ADR-0004).
 */
export function reportPrBody(args: {
  version: string;
  milestone: MilestoneLink;
  releaseIssue: number;
  runUrl: string;
}): string {
  const { version, milestone, releaseIssue, runUrl } = args;
  return (
    [
      `Audit of the milestone ${milestoneLink(milestone)} in \`docs/releases/${version}.md\`. Merging this PR switches release-please's release PR to ${version}.`,
      `Refs #${releaseIssue}`,
      [
        '**Before merging:**',
        '- [ ] Read the audit. Reopen anything missing, or move it to a later milestone on purpose; the report updates when the milestone closes out again.',
        '- [ ] Write the Notes section of the report.',
        `- [ ] In the squash dialog, check the commit message still ends with \`Release-As: ${version}\` as its own paragraph. Delete any Co-authored-by lines GitHub added after it, or release-please won't see it.`,
      ].join('\n'),
      `🤖 Generated with the [Milestone report](${runUrl}) workflow`,
      `Release-As: ${version}`,
    ].join('\n\n') + '\n'
  );
}

// --- CI entry point: everything below talks to GitHub through `gh` and git. ---

/** The project board (docs/agents/issue-tracker.md → Project board). */
const BOARD = { owner: 'itay28', number: '4', status: 'Status', inReview: 'In review' };

const MILESTONE_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    milestone(number: $number) {
      title
      url
      issues(first: 100, after: $after, states: [OPEN, CLOSED]) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title url state stateReason
          labels(first: 50) { nodes { name } }
          closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { number title url merged } }
        }
      }
    }
  }
}`;

interface MilestonePage {
  data: {
    repository: {
      milestone: {
        title: string;
        url: string;
        issues: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: IssueNode[] };
      } | null;
    };
  };
}

const run = (cmd: string, args: string[], token?: string): string =>
  execFileSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 1e8,
    env: token ? { ...process.env, GH_TOKEN: token } : process.env,
  }).trim();
const ghJson = <T>(args: string[], token?: string): T => JSON.parse(run('gh', args, token)) as T;
const notice = (message: string): void => console.log(`::notice::${message}`);
const warning = (message: string): void => console.log(`::warning::${message}`);

function fetchMilestone(repo: string, number: number): MilestoneLink & { issues: MilestoneIssue[] } {
  const [owner = '', name = ''] = repo.split('/');
  const nodes: IssueNode[] = [];
  let after: string | undefined;
  for (;;) {
    // -f sends strings as is; -F would turn `true`, numbers or `@file` into something else. Only number is typed.
    const args = ['api', 'graphql', '-f', `query=${MILESTONE_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`];
    args.push('-F', `number=${number}`, ...(after ? ['-f', `after=${after}`] : []));
    const milestone = ghJson<MilestonePage>(args).data.repository.milestone;
    if (!milestone) throw new Error(`Milestone ${number} not found in ${repo}.`);
    nodes.push(...milestone.issues.nodes);
    if (!milestone.issues.pageInfo.hasNextPage) {
      return { title: milestone.title, url: milestone.url, issues: parseMilestoneIssues(nodes) };
    }
    after = milestone.issues.pageInfo.endCursor;
  }
}

/** Moves the release issue to In review. Needs PROJECT_TOKEN (classic, `project` + `repo`); warns instead of failing. */
function moveToInReview(issueUrl: string, token: string | undefined): void {
  if (!token) {
    warning(
      `PROJECT_TOKEN is not set, so the release issue stays where it is on the board. Move ${issueUrl} to In review by hand.`,
    );
    return;
  }
  try {
    const where = ['--owner', BOARD.owner, '--format', 'json'];
    const project = ghJson<{ id: string }>(['project', 'view', BOARD.number, ...where], token);
    const { fields } = ghJson<{ fields: { id: string; name: string; options?: { id: string; name: string }[] }[] }>(
      ['project', 'field-list', BOARD.number, ...where],
      token,
    );
    const status = fields.find((field) => field.name === BOARD.status);
    const option = status?.options?.find((o) => o.name === BOARD.inReview);
    if (!status || !option) throw new Error(`no ${BOARD.status} field with an ${BOARD.inReview} option`);
    const item = ghJson<{ id: string }>(['project', 'item-add', BOARD.number, '--url', issueUrl, ...where], token);
    run(
      'gh',
      [
        'project',
        'item-edit',
        '--project-id',
        project.id,
        '--id',
        item.id,
        '--field-id',
        status.id,
        '--single-select-option-id',
        option.id,
      ],
      token,
    );
    notice(`Moved ${issueUrl} to ${BOARD.inReview}.`);
  } catch (error) {
    warning(`Couldn't move ${issueUrl} to ${BOARD.inReview} on the board: ${(error as Error).message}`);
  }
}

function main(): void {
  const repo = process.env['GITHUB_REPOSITORY'] ?? '';
  const number = Number(process.env['MILESTONE']);
  const runUrl = process.env['RUN_URL'] ?? `https://github.com/${repo}/actions`;
  const dryRun = process.env['DRY_RUN'] === '1';
  if (!repo || !Number.isInteger(number) || number < 1) {
    throw new Error('Set GITHUB_REPOSITORY (owner/name) and MILESTONE (the milestone number).');
  }

  const milestone = fetchMilestone(repo, number);
  const version = releaseVersion(milestone.title);
  if (!version) return notice(`Milestone "${milestone.title}" has no vX.Y.Z version in its title; no report.`);
  const release = releaseIssue(milestone.issues);
  if (!isMilestoneDone(milestone.issues) && !dryRun) {
    const open = milestone.issues.filter((issue) => issue.state === 'open' && !isRelease(issue));
    const why = release
      ? `open: ${open.map((issue) => `#${issue.number}`).join(', ')}`
      : 'it has no open release issue (already released, or none was created)';
    return notice(`Milestone "${milestone.title}" isn't done (${why}); no report.`);
  }

  const tags = run('gh', ['api', '--paginate', `repos/${repo}/tags?per_page=100`, '--jq', '.[].name']).split('\n');
  if (tags.includes(`v${version}`) && !dryRun) return notice(`v${version} is already tagged; no report.`);
  const title = reportPrTitle(version);
  const mergedReports = ghJson<{ title: string }[]>([
    'pr',
    'list',
    '--state',
    'merged',
    '--search',
    `"${title}" in:title`,
    '--json',
    'title',
  ]);
  if (mergedReports.some((pr) => pr.title === title) && !dryRun) {
    return notice(`The report PR for ${version} is already merged; merge release-please's release PR to ship it.`);
  }

  const since = previousReleaseTag(tags, version);
  const sinceDate = since
    ? run('gh', ['api', `repos/${repo}/commits/${since}`, '--jq', '.commit.committer.date'])
    : null;
  const events = ghJson<IssueEvent[][]>([
    'api',
    '--paginate',
    '--slurp',
    `repos/${repo}/issues/events?per_page=100`,
  ]).flat();
  const merged = ghJson<MergedPr[]>([
    'pr',
    'list',
    '--state',
    'merged',
    '--base',
    'main',
    '--limit',
    '1000',
    ...(sinceDate ? ['--search', `merged:>=${sinceDate}`] : []),
    '--json',
    'number,title,url,mergedAt,closingIssuesReferences',
  ]);
  const inMilestone = milestone.issues.map((issue) => issue.number);
  const data: ReportData = {
    version,
    milestone: { title: milestone.title, url: milestone.url },
    issues: milestone.issues,
    movedOut: movedOut(events, milestone.title, inMilestone),
    added: addedPrs(merged, inMilestone, sinceDate),
    since,
  };
  const body = release && reportPrBody({ version, milestone: data.milestone, releaseIssue: release.number, runUrl });
  if (dryRun) {
    console.log(`${title}\n\n${body ?? '(No open release issue, so no PR body.)'}\n---\n${buildReport(data)}`);
    return;
  }
  if (!release || !body) return; // Only a dry run gets here without a release issue (isMilestoneDone).

  // Reuse the report branch if it exists, so the human's Notes survive and nothing is force-pushed.
  const branch = `chore/release-${version}`;
  const path = `docs/releases/${version}.md`;
  run('git', ['config', 'user.name', 'github-actions[bot]']);
  run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  if (run('git', ['ls-remote', '--heads', 'origin', branch])) {
    run('git', ['fetch', 'origin', `${branch}:refs/remotes/origin/${branch}`]);
    run('git', ['switch', '-c', branch, '--track', `origin/${branch}`]);
  } else {
    run('git', ['switch', '-c', branch]);
  }
  const notes = existsSync(path) ? extractNotes(readFileSync(path, 'utf8')) : undefined;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buildReport(data, notes));
  run('git', ['add', path]);
  if (spawnSync('git', ['diff', '--cached', '--quiet']).status === 0) {
    notice(`${path} is already up to date.`);
  } else {
    run('git', ['commit', '-m', `chore: milestone report for ${version}`]);
    run('git', ['push', 'origin', branch]);
  }

  const prToken = process.env['PR_TOKEN'];
  const open = ghJson<{ url: string }[]>(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'url']);
  if (open[0]) {
    // The card moved when the PR opened; a human may have moved it since, so leave it alone.
    notice(`Updated the report PR: ${open[0].url}`);
  } else {
    const bodyFile = join(tmpdir(), `milestone-report-${version}.md`);
    writeFileSync(bodyFile, body);
    const url = run(
      'gh',
      ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body-file', bodyFile],
      prToken,
    );
    notice(`Opened the report PR: ${url}`);
    moveToInReview(release.url, process.env['PROJECT_TOKEN']);
  }
}

// CI entry point: `MILESTONE=<n> node scripts/milestone-report.ts`, run by .github/workflows/milestone-report.yml.
// Locally, `DRY_RUN=1 GITHUB_REPOSITORY=itay28/Military-TD MILESTONE=<n> node scripts/milestone-report.ts`
// prints the PR and report for any milestone, done or not, and changes nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

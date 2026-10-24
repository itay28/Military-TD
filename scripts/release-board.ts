import { pathToFileURL } from 'node:url';

// Moves a milestone's release issue on the project board and closes it on release
// (docs/agents/workflow.md, Milestone release). The decisions are pure functions;
// the CLI at the bottom only fetches and writes.

/** 'v0.3.0' → '0.3.0', 'v2.0.0' → '2.0.0'. Patch releases, post-1.0 minors and pre-releases → null. */
export function milestoneVersion(tag: string): string | null {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (!m) return null;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const milestone = major === 0 ? minor > 0 && patch === 0 : minor === 0 && patch === 0;
  return milestone ? `${major}.${minor}.${patch}` : null;
}

/** Release issues to move to In progress: those of the closing issues' milestones still in Backlog or Ready. */
export function releaseIssuesToStart(
  closing: { number: number; milestone: number | null }[],
  releaseIssues: { number: number; milestone: number; status: string | null }[],
): number[] {
  const milestones = new Set(closing.map((i) => i.milestone));
  return releaseIssues
    .filter((r) => milestones.has(r.milestone) && (r.status === 'Backlog' || r.status === 'Ready'))
    .map((r) => r.number);
}

export interface Milestone {
  number: number;
  title: string;
  state: 'open' | 'closed';
}

/** What a release closes: the milestone named after a milestone tag and its open release issues. */
export function releaseToClose(
  tag: string,
  milestones: Milestone[],
  releaseIssues: { number: number; milestone: number }[],
): { milestone: number; closeMilestone: boolean; issues: number[] } | null {
  const version = milestoneVersion(tag);
  if (!version) return null;
  // Milestone titles are the version, optionally followed by a name: 'v0.1.0 — MVP'.
  const milestone = milestones.find((m) => m.title === `v${version}` || m.title.startsWith(`v${version} `));
  if (!milestone) return null;
  return {
    milestone: milestone.number,
    closeMilestone: milestone.state === 'open',
    issues: releaseIssues.filter((i) => i.milestone === milestone.number).map((i) => i.number),
  };
}

// --- CLI -------------------------------------------------------------------
// `node scripts/release-board.ts pr <n>`: run by .github/workflows/release-board.yml.
// `node scripts/release-board.ts release <tag>`: run by the release-issue job in release-please.yml.
// DRY_RUN=1 prints what would change without writing.

const PROJECT_NUMBER = 4;
const API = 'https://api.github.com';
const dryRun = Boolean(process.env['DRY_RUN']);
const [owner, name] = (process.env['GITHUB_REPOSITORY'] ?? 'itay28/Military-TD').split('/') as [string, string];

async function request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await request<{ data: T; errors?: unknown }>(token, 'POST', '/graphql', { query, variables });
  if (res.errors) throw new Error(`GraphQL: ${JSON.stringify(res.errors)}`);
  return res.data;
}

interface BoardQuery {
  repository: {
    pullRequest: { closingIssuesReferences: { nodes: { number: number; milestone: { number: number } | null }[] } };
    issues: {
      nodes: {
        number: number;
        milestone: { number: number } | null;
        projectItems: { nodes: { id: string; project: { id: string }; status: { name: string } | null }[] };
      }[];
    };
  };
  user: { projectV2: { id: string; field: { id: string; options: { id: string; name: string }[] } } };
}

const BOARD_QUERY = `
query($owner: String!, $name: String!, $pr: Int!, $project: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pr) { closingIssuesReferences(first: 50) { nodes { number milestone { number } } } }
    issues(labels: ["release"], states: OPEN, first: 100) {
      nodes {
        number
        milestone { number }
        projectItems(first: 20) {
          nodes {
            id
            project { id }
            status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          }
        }
      }
    }
  }
  user(login: $owner) {
    projectV2(number: $project) {
      id
      field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
    }
  }
}`;

const SET_STATUS = `
mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(
    input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }
  ) { projectV2Item { id } }
}`;

async function startReleaseIssues(pr: number): Promise<void> {
  const token = process.env['PROJECT_TOKEN'];
  if (!token) {
    console.log(
      '::warning::PROJECT_TOKEN is not set, so release issues were not moved on the board. ' +
        'Add a classic PAT with project + repo scopes as the repo secret PROJECT_TOKEN.',
    );
    return;
  }
  const data = await graphql<BoardQuery>(token, BOARD_QUERY, { owner, name, pr, project: PROJECT_NUMBER });
  const project = data.user.projectV2;
  const releaseIssues = data.repository.issues.nodes
    .filter((i) => i.milestone)
    .map((i) => {
      const item = i.projectItems.nodes.find((n) => n.project.id === project.id);
      return { number: i.number, milestone: i.milestone!.number, status: item?.status?.name ?? null, item: item?.id };
    });
  const closing = data.repository.pullRequest.closingIssuesReferences.nodes.map((i) => ({
    number: i.number,
    milestone: i.milestone?.number ?? null,
  }));

  const toStart = releaseIssuesToStart(closing, releaseIssues);
  if (toStart.length === 0) {
    console.log(`PR #${pr}: no release issue to move.`);
    return;
  }
  const inProgress = project.field.options.find((o) => o.name === 'In progress');
  if (!inProgress) throw new Error('The board has no "In progress" status.');
  for (const number of toStart) {
    const issue = releaseIssues.find((r) => r.number === number)!;
    console.log(`PR #${pr}: release issue #${number}: ${issue.status} → In progress${dryRun ? ' (dry run)' : ''}`);
    if (dryRun) continue;
    await graphql(token, SET_STATUS, {
      project: project.id,
      item: issue.item,
      field: project.field.id,
      option: inProgress.id,
    });
  }
}

async function closeReleaseIssues(tag: string): Promise<void> {
  if (!milestoneVersion(tag)) {
    console.log(`${tag} is not a milestone release; nothing to close.`);
    return;
  }
  const token = process.env['GITHUB_TOKEN'];
  if (!token) throw new Error('GITHUB_TOKEN is not set.');
  const repo = `/repos/${owner}/${name}`;
  const milestones = await request<Milestone[]>(token, 'GET', `${repo}/milestones?state=all&per_page=100`);
  const issues = await request<{ number: number; milestone: { number: number } | null; pull_request?: unknown }[]>(
    token,
    'GET',
    `${repo}/issues?labels=release&state=open&per_page=100`,
  );
  const releaseIssues = issues
    .filter((i) => !i.pull_request && i.milestone)
    .map((i) => ({ number: i.number, milestone: i.milestone!.number }));

  const plan = releaseToClose(tag, milestones, releaseIssues);
  if (!plan) {
    console.log(`::warning::No milestone is titled after ${tag}; nothing closed.`);
    return;
  }
  const releaseUrl = `${process.env['GITHUB_SERVER_URL'] ?? 'https://github.com'}/${owner}/${name}/releases/tag/${tag}`;
  const note = dryRun ? ' (dry run)' : '';
  for (const number of plan.issues) {
    console.log(`${tag}: closing release issue #${number}${note}`);
    if (dryRun) continue;
    await request(token, 'POST', `${repo}/issues/${number}/comments`, { body: `Released in [${tag}](${releaseUrl}).` });
    await request(token, 'PATCH', `${repo}/issues/${number}`, { state: 'closed', state_reason: 'completed' });
  }
  if (plan.closeMilestone) {
    console.log(`${tag}: closing milestone ${plan.milestone}${note}`);
    if (!dryRun) await request(token, 'PATCH', `${repo}/milestones/${plan.milestone}`, { state: 'closed' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, arg = ''] = process.argv.slice(2);
  const run =
    mode === 'pr' && /^\d+$/.test(arg)
      ? startReleaseIssues(Number(arg))
      : mode === 'release' && arg
        ? closeReleaseIssues(arg)
        : Promise.reject(new Error('Usage: node scripts/release-board.ts pr <number> | release <tag>'));
  run.catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
